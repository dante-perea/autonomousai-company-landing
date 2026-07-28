(() => {
  const root = document.documentElement;
  let canvas = document.querySelector('#gpu-field');

  if (!canvas) {
    return;
  }

  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const finePointerQuery = window.matchMedia?.('(pointer: fine)');
  let reducedMotion = motionQuery?.matches ?? false;
  let destroyed = false;
  let running = false;
  let contextLost = false;
  let animationFrame = 0;
  let singleFrame = 0;
  let resizePending = true;
  let program;
  let buffer;
  let uniforms;
  let resizeObserver;
  let frameCount = 0;
  let sampledFrames = 0;
  let sampleDuration = 0;
  let stableSamples = 0;
  let slowSamples = 0;
  let measuredFps = 60;
  let contextLosses = 0;
  let impulse = 0;
  let renderedVelocity = 0;
  let previousDocumentProgress = 0;
  let previousFrame = performance.now();
  const startedAt = previousFrame;

  const options = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  };
  const getWebGL1Context = (target) =>
    target.getContext('webgl', options) || target.getContext('experimental-webgl', options);
  let gl = canvas.getContext('webgl2', options);
  let rendererVersion = gl ? 2 : 0;
  if (!gl) {
    gl = getWebGL1Context(canvas);
    rendererVersion = gl ? 1 : 0;
  }

  const qualityOrder = ['low', 'balanced', 'high'];
  const qualityCaps = {
    low: 320_000,
    balanced: 640_000,
    high: 1_100_000,
  };
  const memory = navigator.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const saveData = navigator.connection?.saveData ?? false;
  const isCompact = Math.min(window.innerWidth, window.innerHeight) < 600;
  const rendererInfo = gl?.getExtension?.('WEBGL_debug_renderer_info');
  const rendererName = rendererInfo
    ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)
    : gl?.getParameter?.(gl.RENDERER) ?? '';
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(rendererName);
  const requiresLowQuality = softwareRenderer || saveData || memory <= 2 || cores <= 4;
  const requiresBalancedQuality = isCompact || memory <= 4 || cores < 12;
  let quality = requiresLowQuality
    ? 'low'
    : requiresBalancedQuality
      ? 'balanced'
      : 'high';
  const maximumQualityIndex = requiresLowQuality ? 0 : requiresBalancedQuality ? 1 : 2;
  let adaptiveQualityCeiling = maximumQualityIndex;
  let promotionCooldownSamples = 0;
  let lastPromotionSample = Number.NEGATIVE_INFINITY;
  let qualitySampleIndex = 0;

  const mouse = { x: 0.72, y: 0.38 };
  const mouseTarget = { x: 0.72, y: 0.38 };
  let fieldWidth = 1;
  let fieldHeight = 1;

  const setRenderState = (state) => {
    root.dataset.renderState = state;
  };

  const setFallbackSize = () => {
    canvas.width = Math.max(1, window.innerWidth);
    canvas.height = Math.max(1, window.innerHeight);
  };

  if (!gl) {
    setFallbackSize();
    root.dataset.gpu = 'fallback';
    root.dataset.renderer = 'css';
    root.dataset.quality = 'low';
    setRenderState('static');
    return;
  }

  root.dataset.renderer = rendererVersion === 2 ? 'webgl2' : 'webgl1';
  root.dataset.quality = quality;

  const getVertexSource = () =>
    rendererVersion === 2
      ? `#version 300 es
        in vec2 p;
        void main() {
          gl_Position = vec4(p, 0.0, 1.0);
        }
      `
      : `
        attribute vec2 p;
        void main() {
          gl_Position = vec4(p, 0.0, 1.0);
        }
      `;

  const fragmentBody = `
    uniform float u_time;
    uniform vec2 u_res;
    uniform vec2 u_pointer;
    uniform float u_scene;
    uniform float u_progress;
    uniform float u_document;
    uniform float u_velocity;
    uniform float u_intro;
    uniform float u_impulse;
    uniform float u_reduced;
    uniform float u_quality;

    #define PI 3.14159265359

    float saturate(float value) {
      return clamp(value, 0.0, 1.0);
    }

    float hash21(vec2 point) {
      point = fract(point * vec2(123.34, 456.21));
      point += dot(point, point + 45.32);
      return fract(point.x * point.y);
    }

    float noise(vec2 point) {
      vec2 cell = floor(point);
      vec2 local = fract(point);
      local = local * local * (3.0 - 2.0 * local);
      float a = hash21(cell);
      float b = hash21(cell + vec2(1.0, 0.0));
      float c = hash21(cell + vec2(0.0, 1.0));
      float d = hash21(cell + vec2(1.0, 1.0));
      return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
    }

    float fbm(vec2 point) {
      float value = 0.0;
      float amplitude = 0.52;
      mat2 transform = mat2(1.72, 1.14, -1.14, 1.72);
      for (int index = 0; index < 2; index++) {
        value += amplitude * noise(point);
        point = transform * point + 0.13;
        amplitude *= 0.49;
      }
      return value;
    }

    float softPoint(vec2 point, vec2 center, float radius) {
      float distanceToPoint = length(point - center);
      return exp(-distanceToPoint * distanceToPoint / max(0.0001, radius));
    }

    float ellipseRing(vec2 point, vec2 radius, float sharpness) {
      float distanceToRing = abs(length(point / radius) - 1.0);
      return exp(-distanceToRing * sharpness);
    }

    float lineSegment(vec2 point, vec2 from, vec2 to) {
      vec2 segment = to - from;
      float projection = saturate(dot(point - from, segment) / dot(segment, segment));
      return length(point - (from + segment * projection));
    }

    float sceneWeight(float target) {
      float distanceToScene = abs(u_scene - target);
      return 1.0 - smoothstep(0.0, 1.0, distanceToScene);
    }

    vec3 possibilityField(vec2 uv, float time) {
      float first = fbm(uv * 1.18 + vec2(time * 0.17, -time * 0.12));
      float second = fbm(uv * 1.46 + vec2(-time * 0.1, time * 0.14) + first);
      float warped = mix(first, second, 0.58) + sin((uv.x + uv.y + first) * 3.4) * 0.06;
      vec3 base = vec3(0.011, 0.012, 0.032);
      vec3 ultraviolet = vec3(0.26, 0.13, 0.78);
      vec3 cobalt = vec3(0.035, 0.24, 0.78);
      vec3 color = mix(base, ultraviolet, smoothstep(0.28, 0.82, warped) * 0.7);
      color = mix(color, cobalt, smoothstep(0.5, 0.92, second) * 0.36);
      return color;
    }

    vec3 heroStructure(vec2 uv, float aspect, float time) {
      vec2 center = vec2(min(aspect * 0.23, 0.48), 0.035);
      vec2 local = uv - center;
      float radius = length(local);
      float angle = atan(local.y, local.x);
      float outer = ellipseRing(local, vec2(0.34, 0.34), 30.0);
      float inner = ellipseRing(local, vec2(0.225, 0.225), 36.0);
      float arcGate = smoothstep(-0.18, 0.14, sin(angle - 0.62));
      float filaments =
        pow(saturate(0.5 + 0.5 * sin(angle * 9.0 + radius * 36.0 - time * 0.7)), 8.0) *
        exp(-radius * 2.7);
      float nucleus = softPoint(uv, center, 0.0045);
      float introWave = exp(-abs(radius - u_intro * 1.02) * 34.0) * (1.0 - smoothstep(0.88, 1.0, u_intro));
      float proof = outer * (0.35 + 0.65 * u_intro) + inner * 0.5 + filaments * 0.34;
      vec3 color = vec3(0.42, 0.3, 1.0) * proof;
      color += vec3(0.06, 0.94, 0.78) * outer * arcGate * u_intro * 0.9;
      color += vec3(0.86, 0.9, 1.0) * nucleus * (0.65 + 0.35 * sin(time * 2.0));
      color += vec3(0.2, 0.94, 0.84) * introWave * 0.52;
      return color;
    }

    vec3 loopStructure(vec2 uv, float time) {
      vec2 radius = vec2(0.57, 0.285);
      float circuit = ellipseRing(uv, radius, 42.0);
      float innerCircuit = ellipseRing(uv, radius * 0.82, 55.0) * 0.28;
      float theta = mix(-PI, PI, saturate(u_progress));
      vec2 tokenPosition = vec2(cos(theta) * radius.x, sin(theta) * radius.y);
      float token = softPoint(uv, tokenPosition, 0.0018);
      float gate = exp(-abs(uv.x - 0.2) * 90.0) * smoothstep(0.35, 0.0, abs(uv.y));
      float scanning = gate * (0.48 + 0.52 * sin(uv.y * 110.0 - time * 2.2));
      float closure = smoothstep(0.66, 0.9, u_progress);
      vec3 color = vec3(0.48, 0.36, 1.0) * circuit * (0.28 + 0.72 * u_progress);
      color += vec3(0.85, 0.88, 1.0) * innerCircuit;
      color += vec3(0.06, 0.96, 0.78) * (token * 1.6 + scanning * 0.65 + circuit * closure * 0.54);
      return color;
    }

    vec3 frontierStructure(vec2 uv, float time) {
      vec2 left = uv - vec2(-0.36, 0.0);
      vec2 right = uv - vec2(0.36, 0.0);
      float leftMask = smoothstep(0.58, 0.08, length(left));
      float rightMask = smoothstep(0.62, 0.1, length(right));
      float lattice =
        exp(-abs(fract((left.x + 0.02 * sin(time)) * 18.0) - 0.5) * 42.0) +
        exp(-abs(fract(left.y * 18.0) - 0.5) * 42.0);
      float material =
        noise(right * 3.2 + vec2(time * 0.08, -time * 0.05)) * 0.68 +
        noise(right * 6.4 + vec2(-time * 0.04, time * 0.07)) * 0.32;
      float contours = exp(-abs(fract(material * 7.0 + length(right) * 5.0) - 0.5) * 24.0);
      float split = exp(-abs(uv.x) * 72.0) * smoothstep(0.5, 0.03, abs(uv.y));
      float scan = exp(-abs(uv.y - mix(0.34, -0.34, u_progress)) * 58.0) * rightMask;
      vec3 color = vec3(0.44, 0.3, 1.0) * lattice * leftMask * 0.72;
      color += vec3(0.05, 0.48, 1.0) * contours * rightMask * 0.82;
      color += vec3(0.88, 0.92, 1.0) * split * 0.7;
      color += vec3(0.06, 0.96, 0.78) * scan * smoothstep(0.34, 0.86, u_progress);
      return color;
    }

    vec3 companyStructure(vec2 uv, float time) {
      float expansion = smoothstep(0.12, 0.92, u_progress);
      float first = ellipseRing(uv, vec2(0.115), 36.0);
      float second = ellipseRing(uv, vec2(0.25 + expansion * 0.02), 42.0);
      float third = ellipseRing(uv, vec2(0.43 + expansion * 0.06), 48.0);
      float spokes = 0.0;
      for (int index = 0; index < 6; index++) {
        float angle = float(index) * PI / 3.0 + time * 0.025;
        vec2 node = vec2(cos(angle), sin(angle)) * (0.25 + expansion * 0.18);
        spokes += softPoint(uv, node, 0.0013);
      }
      float relay =
        exp(-lineSegment(uv, vec2(-0.42, 0.18), vec2(0.42, -0.18)) * 58.0) *
        (0.45 + 0.55 * sin((uv.x + uv.y) * 30.0 - time * 2.0));
      vec3 color = vec3(0.4, 0.28, 1.0) * (first * 0.55 + second * 0.42 + third * expansion * 0.62);
      color += vec3(0.05, 0.94, 0.78) * (spokes * 1.3 + relay * 0.32);
      return color;
    }

    void main() {
      float aspect = u_res.x / max(1.0, u_res.y);
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
      vec2 pointer = (u_pointer - 0.5 * u_res) / u_res.y;
      float time = u_time * mix(0.45, 1.0, 1.0 - u_reduced);
      vec3 color = possibilityField(uv, time);

      float heroWeight = sceneWeight(0.0);
      float loopWeight = sceneWeight(1.0);
      float frontierWeight = sceneWeight(2.0);
      float companyWeight = sceneWeight(3.0);

      if (heroWeight > 0.001) {
        color += heroStructure(uv, aspect, time) * heroWeight;
      }
      if (loopWeight > 0.001) {
        color += loopStructure(uv, time) * loopWeight;
      }
      if (frontierWeight > 0.001) {
        color += frontierStructure(uv, time) * frontierWeight;
      }
      if (companyWeight > 0.001) {
        color += companyStructure(uv, time) * companyWeight;
      }

      vec2 anchor = vec2(min(aspect * 0.44, 0.68), -0.34);
      float anchorCore = softPoint(uv, anchor, 0.0014);
      float anchorBoundary = ellipseRing(uv - anchor, vec2(0.057), 52.0);
      color += vec3(1.0, 0.52, 0.12) * (anchorCore * 1.35 + anchorBoundary * (0.3 + companyWeight * 0.65));

      float inspection = softPoint(uv, pointer, 0.032) * (1.0 - u_reduced);
      color += inspection * vec3(0.16, 0.2, 0.38);

      float shockDistance = length(uv - pointer);
      float shock = exp(-abs(shockDistance - (1.0 - u_impulse) * 0.95) * 34.0) * u_impulse;
      color += shock * vec3(0.08, 0.8, 0.68) * 0.62;

      float velocityWave =
        exp(-abs(length(uv) - fract(u_document * 2.4 + time * 0.05) * 0.9) * 32.0) *
        abs(u_velocity);
      color += velocityWave * vec3(0.12, 0.16, 0.38) * 0.36;

      float vignette = smoothstep(1.18, 0.14, length(uv / vec2(max(1.0, aspect * 0.78), 1.0)));
      color *= 0.62 + vignette * 0.54;
      float grain = hash21(gl_FragCoord.xy + floor(u_time * 28.0)) - 0.5;
      color += grain * mix(0.008, 0.016, u_quality);
      color = color / (1.0 + color);
      color = pow(max(color, 0.0), vec3(0.88));
      TAIC_OUTPUT = vec4(color, 1.0);
    }
  `;

  const getFragmentSource = () =>
    rendererVersion === 2
      ? `#version 300 es
        precision highp float;
        out vec4 taicColor;
        #define TAIC_OUTPUT taicColor
        ${fragmentBody}
      `
      : `
        precision highp float;
        #define TAIC_OUTPUT gl_FragColor
        ${fragmentBody}
      `;

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    if (!shader) {
      return null;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('TAIC cinematic shader did not compile:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const releaseResources = () => {
    if (buffer) {
      gl.deleteBuffer(buffer);
      buffer = undefined;
    }
    if (program) {
      gl.deleteProgram(program);
      program = undefined;
    }
  };

  const forgetResources = () => {
    buffer = undefined;
    program = undefined;
    uniforms = undefined;
  };

  const initializeResources = () => {
    releaseResources();
    const vertexShader = compileShader(gl.VERTEX_SHADER, getVertexSource());
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, getFragmentSource());
    if (!vertexShader || !fragmentShader) {
      return false;
    }

    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('TAIC cinematic program did not link:', gl.getProgramInfoLog(program));
      releaseResources();
      return false;
    }

    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    uniforms = {
      time: gl.getUniformLocation(program, 'u_time'),
      resolution: gl.getUniformLocation(program, 'u_res'),
      pointer: gl.getUniformLocation(program, 'u_pointer'),
      scene: gl.getUniformLocation(program, 'u_scene'),
      progress: gl.getUniformLocation(program, 'u_progress'),
      document: gl.getUniformLocation(program, 'u_document'),
      velocity: gl.getUniformLocation(program, 'u_velocity'),
      intro: gl.getUniformLocation(program, 'u_intro'),
      impulse: gl.getUniformLocation(program, 'u_impulse'),
      reduced: gl.getUniformLocation(program, 'u_reduced'),
      quality: gl.getUniformLocation(program, 'u_quality'),
    };
    return true;
  };

  const qualityValue = () => qualityOrder.indexOf(quality) / (qualityOrder.length - 1);

  const getFramebufferSize = () => {
    const cssWidth = Math.max(1, window.innerWidth);
    const cssHeight = Math.max(1, window.innerHeight);
    const deviceScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const desiredWidth = cssWidth * deviceScale;
    const desiredHeight = cssHeight * deviceScale;
    const pixelCap = qualityCaps[quality];
    const scale = Math.min(1, Math.sqrt(pixelCap / (desiredWidth * desiredHeight)));
    return {
      width: Math.max(1, Math.floor(desiredWidth * scale)),
      height: Math.max(1, Math.floor(desiredHeight * scale)),
    };
  };

  const resize = () => {
    if (!resizePending || contextLost) {
      return false;
    }

    resizePending = false;
    const { width: nextWidth, height: nextHeight } = getFramebufferSize();
    const sizeChanged = nextWidth !== fieldWidth || nextHeight !== fieldHeight;

    if (sizeChanged) {
      fieldWidth = nextWidth;
      fieldHeight = nextHeight;
      canvas.width = fieldWidth;
      canvas.height = fieldHeight;
    }
    gl.viewport(0, 0, fieldWidth, fieldHeight);
    return sizeChanged;
  };

  const setQuality = (nextQuality) => {
    if (quality === nextQuality) {
      return;
    }

    quality = nextQuality;
    root.dataset.quality = quality;
    resizePending = true;
  };

  const calibrateQuality = (delta) => {
    if (reducedMotion || document.hidden || delta > 180) {
      return;
    }

    sampledFrames += 1;
    sampleDuration += delta;
    if (sampleDuration < 900) {
      return;
    }

    measuredFps = Math.round((sampledFrames * 1000) / sampleDuration);
    sampledFrames = 0;
    sampleDuration = 0;
    qualitySampleIndex += 1;
    promotionCooldownSamples = Math.max(0, promotionCooldownSamples - 1);
    const qualityIndex = qualityOrder.indexOf(quality);

    if (measuredFps < 52) {
      slowSamples += 1;
      stableSamples = 0;
    } else if (measuredFps >= 57) {
      stableSamples += 1;
      slowSamples = 0;
    } else {
      slowSamples = 0;
      stableSamples = 0;
    }

    if (slowSamples >= 2 && qualityIndex > 0) {
      const nextQualityIndex = qualityIndex - 1;
      if (qualitySampleIndex - lastPromotionSample <= 6) {
        adaptiveQualityCeiling = Math.min(adaptiveQualityCeiling, nextQualityIndex);
      }
      setQuality(qualityOrder[nextQualityIndex]);
      promotionCooldownSamples = 30;
      slowSamples = 0;
      stableSamples = 0;
    } else if (
      stableSamples >= 9 &&
      promotionCooldownSamples === 0 &&
      qualityIndex < adaptiveQualityCeiling
    ) {
      const nextQualityIndex = qualityIndex + 1;
      setQuality(qualityOrder[nextQualityIndex]);
      lastPromotionSample = qualitySampleIndex;
      slowSamples = 0;
      stableSamples = 0;
    }
  };

  const render = (now, scheduleNext = true) => {
    if (destroyed || contextLost || !program) {
      return;
    }

    const delta = Math.min(64, Math.max(0, now - previousFrame));
    previousFrame = now;
    resize();

    const smoothing = 1 - Math.exp(-delta * 0.009);
    mouse.x += (mouseTarget.x - mouse.x) * smoothing;
    mouse.y += (mouseTarget.y - mouse.y) * smoothing;
    impulse *= Math.exp(-delta * 0.0018);

    const state = window.__TAIC_MOTION__ ?? {
      scenePosition: 0,
      sceneProgress: 0.5,
      documentProgress: 0,
      velocity: 0,
      intro: 1,
      scene: 'hero',
    };
    const documentDelta = state.documentProgress - previousDocumentProgress;
    if (Math.abs(documentDelta) > 0.000001) {
      renderedVelocity += (state.velocity - renderedVelocity) * smoothing;
    } else {
      renderedVelocity *= Math.exp(-delta * 0.006);
    }
    previousDocumentProgress = state.documentProgress;

    gl.useProgram(program);
    gl.uniform1f(uniforms.time, (now - startedAt) / 1000);
    gl.uniform2f(uniforms.resolution, fieldWidth, fieldHeight);
    gl.uniform2f(uniforms.pointer, mouse.x * fieldWidth, mouse.y * fieldHeight);
    gl.uniform1f(uniforms.scene, state.scenePosition);
    gl.uniform1f(uniforms.progress, state.sceneProgress);
    gl.uniform1f(uniforms.document, state.documentProgress);
    gl.uniform1f(uniforms.velocity, renderedVelocity);
    gl.uniform1f(uniforms.intro, state.intro);
    gl.uniform1f(uniforms.impulse, impulse);
    gl.uniform1f(uniforms.reduced, reducedMotion ? 1 : 0);
    gl.uniform1f(uniforms.quality, qualityValue());
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    frameCount += 1;
    calibrateQuality(delta);

    if (scheduleNext && running && !reducedMotion && !document.hidden) {
      animationFrame = window.requestAnimationFrame(render);
    }
  };

  const renderSingleFrame = () => {
    window.cancelAnimationFrame(singleFrame);
    singleFrame = window.requestAnimationFrame((now) => render(now, false));
  };

  const start = () => {
    if (destroyed || contextLost || !program) {
      return;
    }

    window.cancelAnimationFrame(animationFrame);
    running = !reducedMotion;
    previousFrame = performance.now();
    if (reducedMotion) {
      setRenderState('static');
      renderSingleFrame();
    } else {
      setRenderState('running');
      animationFrame = window.requestAnimationFrame(render);
    }
  };

  const stop = (state = 'paused') => {
    running = false;
    window.cancelAnimationFrame(animationFrame);
    window.cancelAnimationFrame(singleFrame);
    setRenderState(state);
  };

  const onPointerMove = (event) => {
    if (!finePointerQuery?.matches || reducedMotion) {
      return;
    }
    mouseTarget.x = event.clientX / Math.max(1, window.innerWidth);
    mouseTarget.y = 1 - event.clientY / Math.max(1, window.innerHeight);
  };

  const onResize = () => {
    const { width, height } = getFramebufferSize();
    if (width === fieldWidth && height === fieldHeight) {
      return;
    }
    resizePending = true;
    if (reducedMotion) {
      renderSingleFrame();
    }
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      stop('paused');
    } else if (reducedMotion) {
      setRenderState('static');
    } else {
      start();
    }
  };

  const onMotionPreferenceChange = (event) => {
    reducedMotion = event.matches;
    root.dataset.motion = reducedMotion ? 'reduced' : 'full';
    start();
  };

  const onProofSignal = () => {
    if (reducedMotion) {
      return;
    }
    impulse = 1;
  };

  const onContextLost = (event) => {
    event.preventDefault();
    contextLost = true;
    contextLosses += 1;
    stop('paused');
    forgetResources();
    root.dataset.gpu = 'context-lost';
  };

  const onContextRestored = () => {
    contextLost = false;
    if (!initializeResources()) {
      root.dataset.gpu = 'fallback';
      root.dataset.renderer = 'css';
      setRenderState('static');
      return;
    }
    resizePending = true;
    root.dataset.gpu = 'ready';
    start();
  };

  const onPageHide = (event) => {
    stop('paused');
    if (event.persisted) {
      return;
    }

    destroyed = true;
    resizeObserver?.disconnect();
    releaseResources();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('taic:proof-signal', onProofSignal);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    motionQuery?.removeEventListener?.('change', onMotionPreferenceChange);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
    window.removeEventListener('pageshow', onPageShow);
  };

  const onPageShow = (event) => {
    if (event.persisted && !destroyed) {
      resizePending = true;
      start();
    }
  };

  window.__TAIC_CINEMATIC__ = {
    getSnapshot: () => {
      const state = window.__TAIC_MOTION__;
      return {
        renderer: root.dataset.renderer,
        renderState: root.dataset.renderState,
        quality,
        qualityCeiling: qualityOrder[adaptiveQualityCeiling],
        scene: state?.scene ?? root.dataset.scene,
        scenePosition: state?.scenePosition ?? 0,
        sceneProgress: state?.sceneProgress ?? 0,
        fps: measuredFps,
        frames: frameCount,
        pixelCount: fieldWidth * fieldHeight,
        contextLosses,
      };
    },
  };

  const retryWithWebGL1 = () => {
    if (rendererVersion !== 2) {
      return false;
    }

    releaseResources();
    const replacement = canvas.cloneNode(false);
    canvas.replaceWith(replacement);
    canvas = replacement;
    gl = getWebGL1Context(canvas);
    if (!gl) {
      rendererVersion = 0;
      return false;
    }

    rendererVersion = 1;
    root.dataset.renderer = 'webgl1';
    fieldWidth = 1;
    fieldHeight = 1;
    resizePending = true;
    return initializeResources();
  };

  let initialized = initializeResources();
  if (!initialized) {
    initialized = retryWithWebGL1();
  }

  if (!initialized) {
    setFallbackSize();
    root.dataset.gpu = 'fallback';
    root.dataset.renderer = 'css';
    root.dataset.quality = 'low';
    setRenderState('static');
    return;
  }

  resize();
  const firstFrameTime = performance.now();
  render(firstFrameTime, false);
  let firstDrawSucceeded = gl.getError() === gl.NO_ERROR;
  if (!firstDrawSucceeded && retryWithWebGL1()) {
    resize();
    render(performance.now(), false);
    firstDrawSucceeded = gl.getError() === gl.NO_ERROR;
  }

  if (!firstDrawSucceeded) {
    releaseResources();
    setFallbackSize();
    root.dataset.gpu = 'fallback';
    root.dataset.renderer = 'css';
    setRenderState('static');
    return;
  }

  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('taic:proof-signal', onProofSignal);
  document.addEventListener('visibilitychange', onVisibilityChange);
  motionQuery?.addEventListener?.('change', onMotionPreferenceChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(canvas);
  }

  root.dataset.gpu = 'ready';
  if (reducedMotion) {
    running = false;
    setRenderState('static');
  } else {
    start();
  }
})();

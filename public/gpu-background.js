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
    low: 600_000,
    balanced: 2_000_000,
    high: 4_800_000,
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
  const prefersBalancedStart = isCompact || memory <= 4 || cores < 8;
  let quality = requiresLowQuality
    ? 'low'
    : prefersBalancedStart
      ? 'balanced'
      : 'high';
  const maximumQualityIndex = requiresLowQuality ? 0 : 2;
  let adaptiveQualityCeiling = maximumQualityIndex;
  let promotionCooldownSamples = 0;
  let lastPromotionSample = Number.NEGATIVE_INFINITY;
  let qualitySampleIndex = 0;
  let performanceFrozen = false;

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
    uniform float u_loop_progress;
    uniform float u_frontier_progress;
    uniform float u_company_progress;
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
      for (int index = 0; index < 3; index++) {
        value += amplitude * noise(point);
        if (
          (index == 0 && u_quality < 0.25) ||
          (index == 1 && u_quality < 0.75)
        ) {
          break;
        }
        point = transform * point + 0.13;
        amplitude *= 0.47;
      }
      return value;
    }

    mat2 rotation(float angle) {
      float cosine = cos(angle);
      float sine = sin(angle);
      return mat2(cosine, -sine, sine, cosine);
    }

    float lineSegment(vec2 point, vec2 from, vec2 to) {
      vec2 segment = to - from;
      float projection = saturate(dot(point - from, segment) / max(0.00001, dot(segment, segment)));
      return length(point - (from + segment * projection));
    }

    float roundedBox(vec2 point, vec2 bounds, float radius) {
      vec2 offset = abs(point) - bounds + radius;
      return min(max(offset.x, offset.y), 0.0) + length(max(offset, 0.0)) - radius;
    }

    float slabDistance(vec2 uv, vec2 center, vec2 bounds, float angle) {
      return roundedBox(rotation(angle) * (uv - center), bounds, 0.012);
    }

    float beamProfile(float distanceToBeam, float width) {
      float core = exp(-(distanceToBeam * distanceToBeam) / max(0.000001, width * width));
      float halation = exp(-(distanceToBeam * distanceToBeam) / max(0.000001, width * width * 18.0));
      return core + halation * 0.12;
    }

    float sceneWeight(float target) {
      float distanceToScene = abs(u_scene - target);
      return 1.0 - smoothstep(0.0, 1.0, distanceToScene);
    }

    vec3 acesFilm(vec3 color) {
      return clamp(
        (color * (2.51 * color + 0.03)) /
        (color * (2.43 * color + 0.59) + 0.14),
        0.0,
        1.0
      );
    }

    vec3 glassPlate(
      vec2 uv,
      vec2 center,
      vec2 bounds,
      float angle,
      float exposure,
      float time
    ) {
      vec2 local = rotation(angle) * (uv - center);
      float distanceToPlate = roundedBox(local, bounds, 0.012);
      float body = 1.0 - smoothstep(-0.004, 0.012, distanceToPlate);
      float edge = exp(-abs(distanceToPlate) * 150.0);
      float surface = fbm(local * vec2(9.0, 3.0) + vec2(time * 0.015, 0.0));
      float movingLight = exp(-abs(local.y - sin(time * 0.11) * bounds.y * 0.6) * 4.0);
      vec3 graphite = vec3(0.008, 0.011, 0.018) * body * (0.7 + surface * 0.55);
      float edgeDirection = mix(0.38, 1.0, smoothstep(-bounds.x, bounds.x, local.x));
      vec3 nickel =
        vec3(0.48, 0.55, 0.66) *
        edge *
        edgeDirection *
        exposure *
        (0.025 + movingLight * 0.34);
      vec3 dispersion =
        vec3(0.20, 0.08, 0.34) *
        edge *
        exposure *
        (0.035 + surface * 0.055);
      return graphite + nickel + dispersion;
    }

    vec3 darkroom(vec2 uv, float aspect) {
      float horizontal = saturate(uv.x / max(0.8, aspect) + 0.5);
      float chamber = exp(-length((uv - vec2(0.28, 0.03)) * vec2(0.82, 1.25)) * 1.35);
      vec3 color = vec3(0.0032, 0.0038, 0.0068);
      color += vec3(0.008, 0.010, 0.017) * horizontal * 0.75;
      color += vec3(0.012, 0.017, 0.028) * chamber * 0.42;
      return color;
    }

    vec3 heroOptics(vec2 uv, float aspect, float time, vec2 pointerShift) {
      vec3 color = vec3(0.0);
      vec2 plateCenter = vec2(min(aspect * 0.28, 0.54), 0.015) + pointerShift;
      vec2 plateBounds = vec2(0.094, 0.72);
      float plateAngle = -0.085;
      color += glassPlate(uv, plateCenter, plateBounds, plateAngle, 0.7, time);

      float apertureX = plateCenter.x - 0.15;
      float beamY = 0.29;
      float focus = smoothstep(0.05, 0.88, u_intro);
      float unresolvedWidth = mix(0.034, 0.0065, focus);
      float sourceDistance = lineSegment(
        uv,
        vec2(-aspect * 0.58, beamY + 0.018),
        vec2(apertureX, beamY)
      );
      float sourceBeam = beamProfile(sourceDistance, unresolvedWidth);
      color += vec3(0.26, 0.22, 0.4) * sourceBeam * (0.035 + focus * 0.055);

      float apertureEdge =
        exp(-abs(uv.x - apertureX) * 230.0) *
        (1.0 - smoothstep(0.1, 0.115, abs(uv.y - beamY)));
      color += vec3(0.52, 0.57, 0.68) * apertureEdge * (0.09 + focus * 0.22);

      vec2 refractedStart = vec2(plateCenter.x + 0.035, beamY - 0.01);
      vec2 refractedEnd = vec2(aspect * 0.56, beamY - 0.055);
      float refractedDistance = lineSegment(uv, refractedStart, refractedEnd);
      float refracted = beamProfile(refractedDistance, 0.0048);
      color += vec3(0.64, 0.78, 0.96) * refracted * focus * 0.22;

      float spectralDistanceA = lineSegment(
        uv,
        refractedStart,
        refractedEnd + vec2(0.0, 0.008)
      );
      float spectralDistanceB = lineSegment(
        uv,
        refractedStart,
        refractedEnd - vec2(0.0, 0.009)
      );
      color += vec3(0.30, 0.12, 0.55) * beamProfile(spectralDistanceA, 0.003) * focus * 0.045;
      color += vec3(0.10, 0.43, 0.56) * beamProfile(spectralDistanceB, 0.003) * focus * 0.045;

      float causticWindow = exp(-abs(uv.x - (plateCenter.x + 0.34)) * 3.8);
      float phase = uv.y * 54.0 + sin(uv.x * 8.0 - time * 0.16) * 1.4;
      float resolvedFringes = pow(0.5 + 0.5 * cos(phase), 12.0);
      color +=
        vec3(0.18, 0.25, 0.34) *
        resolvedFringes *
        causticWindow *
        exp(-abs(uv.y - beamY + 0.03) * 7.0) *
        focus *
        0.11;

      return color;
    }

    vec3 loopOptics(vec2 uv, float aspect, float time) {
      vec3 color = vec3(0.0);
      float left = -min(aspect * 0.46, 0.78);
      float right = min(aspect * 0.46, 0.78);
      float benchY = -0.02;

      color += glassPlate(uv, vec2(0.08, benchY), vec2(0.024, 0.25), 0.0, 0.3, time);
      color += glassPlate(uv, vec2(0.28, benchY), vec2(0.035, 0.31), -0.12, 0.36, time);
      color += glassPlate(uv, vec2(0.46, benchY), vec2(0.017, 0.37), 0.0, 0.62, time);
      color += glassPlate(uv, vec2(0.66, benchY), vec2(0.052, 0.3), 0.04, 0.4, time);

      float journey = smoothstep(0.10, 0.84, u_loop_progress);
      float beamEnd = mix(left, right, journey);
      float benchDistance = lineSegment(uv, vec2(left, benchY), vec2(right, benchY));
      float beamMask = 1.0 - smoothstep(beamEnd - 0.008, beamEnd + 0.025, uv.x);
      float beforeDetector = 1.0 - smoothstep(0.42, 0.5, uv.x);
      vec3 signalColor = mix(vec3(0.31, 0.19, 0.58), vec3(0.68, 0.78, 0.91), 1.0 - beforeDetector);
      color += signalColor * beamProfile(benchDistance, 0.0044) * beamMask * 0.18;

      float detector = exp(-abs(uv.x - 0.46) * 125.0) * (1.0 - smoothstep(0.34, 0.42, abs(uv.y)));
      float detectorScan = 0.72 + 0.28 * sin(uv.y * 92.0 - time * 0.38);
      color += vec3(0.66, 0.74, 0.86) * detector * detectorScan * journey * 0.22;

      float closure = smoothstep(0.72, 0.94, u_loop_progress);
      float returnA = lineSegment(uv, vec2(right, benchY), vec2(right, -0.28));
      float returnB = lineSegment(uv, vec2(right, -0.28), vec2(left, -0.28));
      float returnC = lineSegment(uv, vec2(left, -0.28), vec2(left, benchY));
      float returnPath =
        beamProfile(returnA, 0.0032) +
        beamProfile(returnB, 0.0032) +
        beamProfile(returnC, 0.0032);
      color += vec3(0.16, 0.30, 0.38) * returnPath * closure * 0.14;

      float outputFace = 1.0 - smoothstep(
        -0.006,
        0.018,
        slabDistance(uv, vec2(0.66, benchY), vec2(0.052, 0.3), 0.04)
      );
      color += vec3(0.14, 0.22, 0.29) * outputFace * smoothstep(0.62, 0.9, journey) * 0.14;
      return color;
    }

    vec3 frontierOptics(vec2 uv, float aspect, float time) {
      vec3 color = vec3(0.0);
      float left = -min(aspect * 0.48, 0.82);
      float right = min(aspect * 0.48, 0.82);
      vec2 splitter = vec2(-0.04, 0.04);
      float split = smoothstep(0.12, 0.76, u_frontier_progress);

      color += glassPlate(uv, splitter, vec2(0.021, 0.21), -0.785, 0.7, time);

      float inputDistance = lineSegment(uv, vec2(left, 0.04), splitter);
      float applicationDistance = lineSegment(uv, splitter, vec2(right - 0.05, 0.27));
      float researchDistance = lineSegment(uv, splitter, vec2(right - 0.05, -0.27));
      color += vec3(0.42, 0.35, 0.62) * beamProfile(inputDistance, 0.0042) * 0.1;
      color += vec3(0.64, 0.75, 0.89) * beamProfile(applicationDistance, 0.0035) * split * 0.15;

      vec2 sampleLocal = rotation(-0.16) * (uv - vec2(0.29, -0.19));
      float sampleRadius = length(sampleLocal * vec2(1.0, 1.34));
      float sampleMask = 1.0 - smoothstep(0.205, 0.235, sampleRadius);
      float vesselEdge = exp(-abs(sampleRadius - 0.22) * 115.0);
      float density = fbm(sampleLocal * 7.4 + vec2(time * 0.012, -time * 0.008));
      float densityOffset = fbm(
        sampleLocal * 7.4 + vec2(0.035, -0.022) + vec2(time * 0.012, -time * 0.008)
      );
      float schlieren = abs(density - densityOffset) * sampleMask;
      float knifeEdge = smoothstep(0.47, 0.58, density) * sampleMask;
      color += vec3(0.008, 0.022, 0.042) * sampleMask * (0.7 + density * 0.4);
      color += vec3(0.32, 0.42, 0.54) * vesselEdge * split * 0.055;
      color += vec3(0.12, 0.23, 0.34) * schlieren * split * 0.34;
      color += vec3(0.05, 0.11, 0.17) * knifeEdge * split * 0.08;

      float scatteredWidth = mix(
        0.016,
        0.0055,
        smoothstep(0.55, 0.96, u_frontier_progress)
      );
      color +=
        vec3(0.27, 0.4, 0.56) *
        beamProfile(researchDistance, scatteredWidth) *
        split *
        0.105;

      float applicationFringes =
        pow(0.5 + 0.5 * cos(uv.y * 64.0 + time * 0.06), 15.0) *
        exp(-abs(uv.x - (right - 0.05)) * 11.0) *
        exp(-abs(uv.y - 0.27) * 8.0);
      color += vec3(0.28, 0.39, 0.5) * applicationFringes * split * 0.14;

      float applicationDetector =
        exp(-abs(uv.x - (right - 0.05)) * 180.0) *
        (1.0 - smoothstep(0.13, 0.17, abs(uv.y - 0.27)));
      float researchDetector =
        exp(-abs(uv.x - (right - 0.05)) * 180.0) *
        (1.0 - smoothstep(0.13, 0.17, abs(uv.y + 0.27)));
      color +=
        vec3(0.58, 0.66, 0.78) *
        (applicationDetector * 0.15 + researchDetector * 0.105) *
        split;
      return color;
    }

    vec3 companyOptics(vec2 uv, float aspect, float time) {
      vec3 color = vec3(0.0);
      float pullback = smoothstep(0.08, 0.56, u_company_progress);
      float boundary = smoothstep(0.5, 0.72, u_company_progress);
      vec2 drift = vec2(pullback * 0.08, 0.0);

      color +=
        glassPlate(uv, vec2(0.12, 0.0) + drift, vec2(0.095, 0.68), -0.04, 0.48, time) *
        (1.0 - boundary * 0.96);
      color +=
        glassPlate(uv, vec2(0.34, 0.0) + drift, vec2(0.072, 0.5), 0.02, 0.38, time) *
        pullback *
        (1.0 - boundary * 0.94);
      color +=
        glassPlate(uv, vec2(0.51, 0.0) + drift, vec2(0.052, 0.34), -0.015, 0.3, time) *
        smoothstep(0.32, 0.72, pullback) *
        (1.0 - boundary * 0.9);

      float relayDistance = lineSegment(
        uv,
        vec2(-min(aspect * 0.48, 0.82), 0.08),
        vec2(min(aspect * 0.48, 0.82), -0.05)
      );
      color +=
        vec3(0.46, 0.56, 0.7) *
        beamProfile(relayDistance, 0.0038) *
        pullback *
        (1.0 - boundary) *
        0.21;

      float planeX = min(aspect * 0.25, 0.44);
      float brassPlane = exp(-abs(uv.x - planeX) * 105.0);
      float brassHalo = exp(-abs(uv.x - planeX) * 16.0);
      float verticalMask = 1.0 - smoothstep(0.72, 0.88, abs(uv.y));
      color +=
        vec3(0.78, 0.45, 0.16) *
        (brassPlane * 0.66 + brassHalo * 0.055) *
        verticalMask *
        boundary;

      float accountableCore = exp(-dot(
        (uv - vec2(planeX - 0.032, -0.28)) * vec2(22.0, 22.0),
        (uv - vec2(planeX - 0.032, -0.28)) * vec2(22.0, 22.0)
      ));
      color += vec3(0.88, 0.58, 0.25) * accountableCore * boundary * 0.5;
      return color;
    }

    void main() {
      float aspect = u_res.x / max(1.0, u_res.y);
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
      vec2 normalizedPointer = u_pointer / max(u_res, vec2(1.0));
      vec2 pointerShift =
        (normalizedPointer - vec2(0.72, 0.38)) *
        vec2(0.022, 0.016) *
        (1.0 - u_reduced);
      float time = u_time * mix(0.0, 0.22, 1.0 - u_reduced);
      vec3 color = darkroom(uv, aspect);

      float heroWeight = sceneWeight(0.0);
      float loopWeight = sceneWeight(1.0);
      float frontierWeight = sceneWeight(2.0);
      float companyWeight = sceneWeight(3.0);

      if (u_scene < 1.0) {
        color += heroOptics(uv, aspect, time, pointerShift) * heroWeight;
        color += loopOptics(uv, aspect, time) * loopWeight;
      } else if (u_scene < 2.0) {
        color += loopOptics(uv, aspect, time) * loopWeight;
        color += frontierOptics(uv, aspect, time) * frontierWeight;
      } else {
        color += frontierOptics(uv, aspect, time) * frontierWeight;
        color += companyOptics(uv, aspect, time) * companyWeight;
      }

      float velocityExposure = 1.0 - min(0.08, abs(u_velocity) * 0.08);
      color *= velocityExposure;

      float vignette = 1.0 - smoothstep(
        0.45,
        1.15,
        length(uv / vec2(max(0.92, aspect * 0.66), 1.0))
      );
      color *= 0.7 + vignette * 0.42;

      float grainTime = u_reduced > 0.5 ? 0.0 : floor(u_time * 8.0);
      float sensorDither = hash21(gl_FragCoord.xy + grainTime) - 0.5;
      color += sensorDither * mix(0.0018, 0.0034, u_quality);

      color = acesFilm(max(color, 0.0));
      color = pow(color, vec3(0.4545));
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
      loopProgress: gl.getUniformLocation(program, 'u_loop_progress'),
      frontierProgress: gl.getUniformLocation(program, 'u_frontier_progress'),
      companyProgress: gl.getUniformLocation(program, 'u_company_progress'),
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
    if (reducedMotion || performanceFrozen || document.hidden || delta > 180) {
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
    } else if (slowSamples >= 4 && qualityIndex === 0 && measuredFps < 40) {
      performanceFrozen = true;
      running = false;
      setRenderState('static');
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
      locals: {
        loop: 0,
        frontiers: 0,
        company: 0,
      },
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
    gl.uniform1f(uniforms.loopProgress, state.locals?.loop ?? 0);
    gl.uniform1f(uniforms.frontierProgress, state.locals?.frontiers ?? 0);
    gl.uniform1f(uniforms.companyProgress, state.locals?.company ?? 0);
    gl.uniform1f(uniforms.document, state.documentProgress);
    gl.uniform1f(uniforms.velocity, renderedVelocity);
    gl.uniform1f(uniforms.intro, state.intro);
    gl.uniform1f(uniforms.impulse, impulse);
    gl.uniform1f(uniforms.reduced, reducedMotion ? 1 : 0);
    gl.uniform1f(uniforms.quality, qualityValue());
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    frameCount += 1;
    calibrateQuality(delta);

    if (
      scheduleNext &&
      running &&
      !performanceFrozen &&
      !reducedMotion &&
      !document.hidden
    ) {
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
    running = !reducedMotion && !performanceFrozen;
    previousFrame = performance.now();
    if (reducedMotion || performanceFrozen) {
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
    if (reducedMotion || performanceFrozen) {
      renderSingleFrame();
    }
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      stop('paused');
    } else if (reducedMotion || performanceFrozen) {
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

  const onMotionState = () => {
    if (performanceFrozen && !reducedMotion && !document.hidden) {
      renderSingleFrame();
    }
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
    window.removeEventListener('taic:motion-state', onMotionState);
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
        performanceFrozen,
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
  window.addEventListener('taic:motion-state', onMotionState);
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

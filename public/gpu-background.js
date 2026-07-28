(() => {
  const root = document.documentElement;
  const canvas = document.querySelector('#gpu-field');
  const swarmCanvas = document.querySelector('#agent-swarm');

  if (!canvas || !swarmCanvas) {
    return;
  }

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  root.dataset.motion = reducedMotion ? 'reduced' : 'full';

  const setCanvasFallbackSize = () => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    canvas.width = width;
    canvas.height = height;
    swarmCanvas.width = width;
    swarmCanvas.height = height;
  };

  setCanvasFallbackSize();

  const options = {
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  };
  const gl = canvas.getContext('webgl', options) || canvas.getContext('experimental-webgl', options);

  if (!gl) {
    root.dataset.gpu = 'fallback';
    return;
  }

  const vertexSource = `
    attribute vec2 p;
    void main() {
      gl_Position = vec4(p, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;
    uniform float u_time;
    uniform vec2 u_res;
    uniform vec2 u_mouse;
    uniform float u_warp;
    uniform float u_heat;
    uniform float u_bright;
    uniform vec3 u_tint;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      mat2 transform = mat2(1.6, 1.2, -1.2, 1.6);
      for (int i = 0; i < 6; i++) {
        value += amplitude * noise(p);
        p = transform * p;
        amplitude *= 0.5;
      }
      return value;
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
      vec2 mouse = (u_mouse - 0.5 * u_res) / u_res.y;
      float time = u_time * 0.06;
      vec2 q = vec2(
        fbm(uv + time),
        fbm(uv + vec2(5.2, 1.3) - time)
      );
      vec2 r = vec2(
        fbm(uv + u_warp * q + vec2(1.7, 9.2) + time * 0.5),
        fbm(uv + u_warp * q + vec2(8.3, 2.8) - time * 0.5)
      );
      float field = fbm(uv + u_warp * r);
      float distanceToMouse = length(uv - mouse);
      float focus = exp(-distanceToMouse * distanceToMouse * 3.0);
      field += focus * 0.22 * sin(u_time * 2.2 - distanceToMouse * 9.0);

      vec3 base = vec3(0.03, 0.03, 0.07);
      vec3 purple = vec3(0.26, 0.17, 0.78) * u_tint;
      vec3 blue = vec3(0.08, 0.42, 1.0) * u_tint;
      vec3 violet = vec3(0.62, 0.28, 1.0) * u_tint;
      vec3 color = mix(base, purple, smoothstep(0.15, 0.62, field));
      color = mix(color, blue, smoothstep(0.5, 0.88, r.x));
      color = mix(color, violet, smoothstep(0.6, 0.96, q.y) * 0.7);
      color += focus * vec3(0.45, 0.32, 0.75) * 0.4;
      color += u_heat * smoothstep(0.35, 0.92, field) * vec3(0.55, 0.5, 0.7);
      float vignette = smoothstep(1.4, 0.1, length(uv));
      color *= u_bright * vignette;
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const compileShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);

  if (!vertexShader || !fragmentShader) {
    root.dataset.gpu = 'fallback';
    return;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    root.dataset.gpu = 'fallback';
    return;
  }

  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const position = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    time: gl.getUniformLocation(program, 'u_time'),
    resolution: gl.getUniformLocation(program, 'u_res'),
    mouse: gl.getUniformLocation(program, 'u_mouse'),
    warp: gl.getUniformLocation(program, 'u_warp'),
    heat: gl.getUniformLocation(program, 'u_heat'),
    brightness: gl.getUniformLocation(program, 'u_bright'),
    tint: gl.getUniformLocation(program, 'u_tint'),
  };

  const states = {
    hero: { warp: 4.0, heat: 0.0, brightness: 0.66, tint: [1.0, 1.0, 1.0] },
    mechanism: { warp: 4.6, heat: 0.12, brightness: 0.62, tint: [1.12, 0.86, 1.14] },
    frontiers: { warp: 3.7, heat: 0.08, brightness: 0.64, tint: [0.78, 1.0, 1.24] },
    company: { warp: 5.1, heat: 0.34, brightness: 0.72, tint: [0.82, 1.04, 1.18] },
    closing: { warp: 4.2, heat: 0.2, brightness: 0.68, tint: [1.08, 0.94, 1.18] },
  };

  const current = { ...states.hero, tint: [...states.hero.tint] };
  const sections = [...document.querySelectorAll('[data-field-state]')];
  const activeState = () => {
    const center = window.innerHeight * 0.5;
    let nearest = states.hero;
    let nearestDistance = Infinity;

    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      const distance = center < rect.top
        ? rect.top - center
        : center > rect.bottom
          ? center - rect.bottom
          : 0;

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = states[section.dataset.fieldState] ?? states.hero;
      }
    }

    return nearest;
  };

  const swarm = swarmCanvas.getContext('2d');
  const agents = Array.from({ length: 84 }, () => ({
    x: Math.random(),
    y: Math.random(),
    vx: (Math.random() - 0.5) * 0.0008,
    vy: (Math.random() - 0.5) * 0.0008,
  }));

  let fieldWidth = 0;
  let fieldHeight = 0;
  let swarmWidth = 0;
  let swarmHeight = 0;
  let renderScale = 1;
  let degradeLevel = 0;
  let slowSamples = 0;

  const resize = () => {
    const cssWidth = canvas.clientWidth || window.innerWidth;
    const cssHeight = canvas.clientHeight || window.innerHeight;
    const scale = Math.min(1, 1800 / cssWidth) * renderScale;
    const nextWidth = Math.max(1, Math.floor(cssWidth * scale));
    const nextHeight = Math.max(1, Math.floor(cssHeight * scale));

    if (nextWidth !== fieldWidth || nextHeight !== fieldHeight) {
      fieldWidth = nextWidth;
      fieldHeight = nextHeight;
      canvas.width = fieldWidth;
      canvas.height = fieldHeight;
      gl.viewport(0, 0, fieldWidth, fieldHeight);
    }

    const nextSwarmWidth = swarmCanvas.clientWidth || window.innerWidth;
    const nextSwarmHeight = swarmCanvas.clientHeight || window.innerHeight;
    if (nextSwarmWidth !== swarmWidth || nextSwarmHeight !== swarmHeight) {
      swarmWidth = nextSwarmWidth;
      swarmHeight = nextSwarmHeight;
      swarmCanvas.width = swarmWidth;
      swarmCanvas.height = swarmHeight;
    }
  };

  const mouse = { x: 0.76, y: 0.64 };
  const mouseTarget = { x: 0.76, y: 0.64 };
  const onPointerMove = (event) => {
    mouseTarget.x = event.clientX / window.innerWidth;
    mouseTarget.y = 1 - event.clientY / window.innerHeight;
  };

  const drawSwarm = () => {
    if (!swarm) {
      return;
    }

    swarm.clearRect(0, 0, swarmWidth, swarmHeight);
    const targetX = mouseTarget.x;
    const targetY = 1 - mouseTarget.y;

    for (const agent of agents) {
      if (!reducedMotion) {
        agent.vx += (Math.random() - 0.5) * 0.00007;
        agent.vy += (Math.random() - 0.5) * 0.00007;
        const dx = targetX - agent.x;
        const dy = targetY - agent.y;
        const distance = Math.hypot(dx, dy) + 0.0001;

        if (distance < 0.26) {
          agent.vx += (dx / distance) * 0.00005;
          agent.vy += (dy / distance) * 0.00005;
        }

        agent.vx *= 0.99;
        agent.vy *= 0.99;
        const speed = Math.hypot(agent.vx, agent.vy);
        const maxSpeed = 0.0017;

        if (speed > maxSpeed) {
          agent.vx = (agent.vx / speed) * maxSpeed;
          agent.vy = (agent.vy / speed) * maxSpeed;
        }

        agent.x += agent.vx;
        agent.y += agent.vy;
        if (agent.x < 0) agent.x += 1;
        if (agent.x > 1) agent.x -= 1;
        if (agent.y < 0) agent.y += 1;
        if (agent.y > 1) agent.y -= 1;
      }
    }

    const glow = 0.45 + current.heat * 0.55;
    for (let index = 0; index < agents.length; index += 1) {
      for (let peer = index + 1; peer < agents.length; peer += 1) {
        const first = agents[index];
        const second = agents[peer];
        const distance = Math.hypot(
          (first.x - second.x) * swarmWidth,
          (first.y - second.y) * swarmHeight,
        );

        if (distance < 118) {
          const alpha = (1 - distance / 118) * 0.13 * glow;
          swarm.strokeStyle = `rgba(150, 140, 255, ${alpha.toFixed(3)})`;
          swarm.lineWidth = 1;
          swarm.beginPath();
          swarm.moveTo(first.x * swarmWidth, first.y * swarmHeight);
          swarm.lineTo(second.x * swarmWidth, second.y * swarmHeight);
          swarm.stroke();
        }
      }
    }

    for (const agent of agents) {
      swarm.fillStyle = `rgba(190, 180, 255, ${(0.5 * glow).toFixed(3)})`;
      swarm.beginPath();
      swarm.arc(agent.x * swarmWidth, agent.y * swarmHeight, 1.6, 0, Math.PI * 2);
      swarm.fill();
    }
  };

  const startedAt = performance.now();
  let previousFrame = startedAt;
  let frameCount = 0;
  let frameTimeTotal = 0;
  let sampleTimeTotal = 0;
  let animationFrame = 0;
  let running = true;

  const render = (now, scheduleNext = true) => {
    if (!running) {
      return;
    }

    resize();
    mouse.x += (mouseTarget.x - mouse.x) * 0.06;
    mouse.y += (mouseTarget.y - mouse.y) * 0.06;

    const target = activeState();
    current.warp += (target.warp - current.warp) * 0.05;
    current.heat += (target.heat - current.heat) * 0.05;
    current.brightness += (target.brightness - current.brightness) * 0.05;
    current.tint[0] += (target.tint[0] - current.tint[0]) * 0.05;
    current.tint[1] += (target.tint[1] - current.tint[1]) * 0.05;
    current.tint[2] += (target.tint[2] - current.tint[2]) * 0.05;

    gl.uniform1f(uniforms.time, (now - startedAt) / 1000);
    gl.uniform2f(uniforms.resolution, fieldWidth, fieldHeight);
    gl.uniform2f(uniforms.mouse, mouse.x * fieldWidth, mouse.y * fieldHeight);
    gl.uniform1f(uniforms.warp, current.warp);
    gl.uniform1f(uniforms.heat, current.heat);
    gl.uniform1f(uniforms.brightness, current.brightness);
    gl.uniform3f(uniforms.tint, current.tint[0], current.tint[1], current.tint[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawSwarm();

    const delta = now - previousFrame;
    previousFrame = now;
    frameCount += 1;
    frameTimeTotal += delta;
    sampleTimeTotal += delta;

    if (sampleTimeTotal >= 280) {
      const framesPerSecond = Math.round(1000 / (frameTimeTotal / frameCount));
      slowSamples = framesPerSecond < 38 ? slowSamples + 1 : 0;
      frameCount = 0;
      frameTimeTotal = 0;
      sampleTimeTotal = 0;

      if (slowSamples >= 3 && degradeLevel < 2) {
        degradeLevel += 1;
        slowSamples = 0;
        renderScale = degradeLevel === 1 ? 0.72 : 0.5;
        fieldWidth = 0;
        fieldHeight = 0;
        const targetAgentCount = degradeLevel === 1 ? 56 : 34;
        agents.splice(targetAgentCount);
      }
    }

    if (scheduleNext && !reducedMotion && !document.hidden) {
      animationFrame = window.requestAnimationFrame(render);
    }
  };

  const renderSingleFrame = () => {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame((now) => render(now, false));
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      window.cancelAnimationFrame(animationFrame);
      return;
    }

    previousFrame = performance.now();
    animationFrame = window.requestAnimationFrame(render);
  };

  const onScroll = reducedMotion ? renderSingleFrame : undefined;
  const onResize = reducedMotion ? renderSingleFrame : resize;
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  if (onScroll) {
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  const onPageHide = (event) => {
    window.cancelAnimationFrame(animationFrame);

    if (event.persisted) {
      return;
    }

    running = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (onScroll) {
      window.removeEventListener('scroll', onScroll);
    }
    window.removeEventListener('pageshow', onPageShow);
  };

  const onPageShow = (event) => {
    if (!event.persisted || !running) {
      return;
    }

    previousFrame = performance.now();
    resize();
    if (reducedMotion) {
      renderSingleFrame();
    } else {
      animationFrame = window.requestAnimationFrame(render);
    }
  };

  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  root.dataset.gpu = 'ready';
  resize();
  render(performance.now(), !reducedMotion);
})();

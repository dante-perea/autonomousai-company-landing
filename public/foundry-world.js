import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PALETTE = Object.freeze({
  ivory: 0xe7e1d5,
  chalk: 0xf4efe5,
  graphite: 0x171613,
  black: 0x070604,
  steel: 0x838782,
  coolSteel: 0x71818c,
  brass: 0xa57332,
  amber: 0xffa51f,
  ember: 0xff6b0a,
  reject: 0x49443d,
});

const NARROW_SCREEN_CANVAS_MASK =
  'radial-gradient(ellipse 78% 58% at 108% 92%, #000 0%, rgba(0, 0, 0, 0.88) 36%, rgba(0, 0, 0, 0.08) 66%, transparent 86%)';

const isSoftwareRenderer = (rendererName = '') =>
  /swiftshader|llvmpipe|lavapipe|software rasterizer/i.test(rendererName);

const QUALITY = Object.freeze({
  low: {
    dpr: 0.8,
    corridorFrames: 9,
    streamCount: 24,
    fragmentCount: 16,
    applicationCount: 18,
    organizationCount: 12,
    dustCount: 70,
    radialSegments: 20,
  },
  balanced: {
    dpr: 1.1,
    corridorFrames: 12,
    streamCount: 36,
    fragmentCount: 24,
    applicationCount: 26,
    organizationCount: 18,
    dustCount: 120,
    radialSegments: 32,
  },
  high: {
    dpr: 1.5,
    corridorFrames: 15,
    streamCount: 48,
    fragmentCount: 34,
    applicationCount: 36,
    organizationCount: 24,
    dustCount: 180,
    radialSegments: 48,
  },
});

const BEATS = Object.freeze([
  { id: 'intention', start: 0, end: 0.105 },
  { id: 'execution', start: 0.105, end: 0.275 },
  { id: 'verification', start: 0.275, end: 0.425 },
  { id: 'frontiers', start: 0.425, end: 0.625 },
  { id: 'scale', start: 0.625, end: 0.81 },
  { id: 'judgement', start: 0.81, end: 1 },
]);

const CAMERA_TIMES = Object.freeze([
  0,
  0.06,
  0.12,
  0.2,
  0.28,
  0.36,
  0.46,
  0.55,
  0.63,
  0.68,
  0.72,
  0.76,
  0.8,
  0.84,
]);

const CAMERA_POINTS = Object.freeze([
  [0, 2.3, 14],
  [0.8, 2.1, 7],
  [-1.8, 1.35, -13],
  [2.4, 0.8, -34],
  [0.8, 1.55, -62],
  [-7, 3.1, -66],
  [-8, 4.3, -96],
  [-1, 5.2, -119],
  [10, 7, -151],
  [31, 8, -166],
  [35, 10, -169],
  [36, 10.5, -181],
  [39, 8.5, -198],
  [39, 7, -214],
]);

const LOOK_POINTS = Object.freeze([
  [-2.6, 0.8, 0],
  [-2.8, 0.8, -4],
  [0, 0.2, -24],
  [0, 0.3, -50],
  [-3.8, 1.5, -82],
  [-3.8, 1.5, -82],
  [-8, 0.8, -115],
  [2, 3, -133],
  [20, 6, -177],
  [39, 7, -205],
  [40, 7, -205],
  [40, 7, -205],
  [43, 7, -218],
  [43, 7, -242],
]);

const CAMERA_FOV = Object.freeze([
  45,
  42,
  50,
  54,
  45,
  42,
  48,
  47,
  50,
  45,
  43,
  47,
  45,
  43,
]);

const CORE_TIMES = Object.freeze([
  0,
  0.1,
  0.2,
  0.31,
  0.4,
  0.52,
  0.64,
  0.72,
  0.8,
  0.84,
  0.9,
]);

const CORE_POINTS = Object.freeze([
  [2.2, 0.8, 0],
  [3, 0.8, -8],
  [2.6, 0.5, -44],
  [1.2, 1.5, -75],
  [0, 1.5, -87],
  [-3, 1.4, -130],
  [20, 4, -175],
  [45, 7, -199],
  [48, 7, -221],
  [48, 7, -232],
  [48, 7, -249],
]);

const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

const smootherStep = (value) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

const rangeProgress = (progress, start, end) =>
  clamp01((progress - start) / Math.max(0.00001, end - start));

const vector = ([x, y, z]) => new THREE.Vector3(x, y, z);

const getBeat = (progress) =>
  BEATS.find((beat) => progress >= beat.start && progress < beat.end)?.id ??
  BEATS[BEATS.length - 1].id;

const getBeatIndex = (progress) =>
  Math.max(0, BEATS.findIndex((beat) => getBeat(progress) === beat.id));

const createSeededRandom = (seed) => {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

const chooseQuality = (canvas, rendererName = '') => {
  const deviceMemory = typeof navigator === 'undefined' ? 8 : navigator.deviceMemory ?? 8;
  const cores = typeof navigator === 'undefined' ? 8 : navigator.hardwareConcurrency ?? 8;
  const saveData =
    typeof navigator !== 'undefined' && Boolean(navigator.connection?.saveData);
  const width =
    canvas?.clientWidth || (typeof window === 'undefined' ? 1440 : window.innerWidth);
  const height =
    canvas?.clientHeight || (typeof window === 'undefined' ? 900 : window.innerHeight);
  const compact = Math.min(width, height) < 640;
  const softwareRenderer = isSoftwareRenderer(rendererName);

  if (softwareRenderer || saveData || deviceMemory <= 2 || cores <= 4) {
    return 'low';
  }

  if (compact || deviceMemory <= 4 || cores < 8) {
    return 'balanced';
  }

  return 'high';
};

const createMonotoneInterpolator = (
  xValues,
  yValues,
  { startAtRest = false, endAtRest = false } = {},
) => {
  const count = xValues.length;
  const deltas = new Array(count - 1);
  const tangents = new Array(count);

  for (let index = 0; index < count - 1; index += 1) {
    deltas[index] =
      (yValues[index + 1] - yValues[index]) /
      Math.max(0.00001, xValues[index + 1] - xValues[index]);
  }

  tangents[0] = startAtRest ? 0 : deltas[0];
  tangents[count - 1] = endAtRest ? 0 : deltas[count - 2];

  for (let index = 1; index < count - 1; index += 1) {
    const before = deltas[index - 1];
    const after = deltas[index];
    tangents[index] =
      before * after <= 0
        ? 0
        : (2 * before * after) / Math.max(0.00001, before + after);
  }

  for (let index = 0; index < count - 1; index += 1) {
    const delta = deltas[index];
    if (Math.abs(delta) < 0.00001) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }

    const before = tangents[index] / delta;
    const after = tangents[index + 1] / delta;
    const magnitude = before * before + after * after;
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude);
      tangents[index] = scale * before * delta;
      tangents[index + 1] = scale * after * delta;
    }
  }

  return (value) => {
    if (value <= xValues[0]) {
      return yValues[0];
    }
    if (value >= xValues[count - 1]) {
      return yValues[count - 1];
    }

    let index = 0;
    while (index < count - 2 && value > xValues[index + 1]) {
      index += 1;
    }

    const span = Math.max(0.00001, xValues[index + 1] - xValues[index]);
    const local = (value - xValues[index]) / span;
    const local2 = local * local;
    const local3 = local2 * local;
    const h00 = 2 * local3 - 3 * local2 + 1;
    const h10 = local3 - 2 * local2 + local;
    const h01 = -2 * local3 + 3 * local2;
    const h11 = local3 - local2;

    return (
      h00 * yValues[index] +
      h10 * span * tangents[index] +
      h01 * yValues[index + 1] +
      h11 * span * tangents[index + 1]
    );
  };
};

const createArcLengthTimeline = (curve, times, options) => {
  const divisions = 600;
  const lengths = curve.getLengths(divisions);
  const totalLength = Math.max(0.00001, lengths[lengths.length - 1]);
  const lastIndex = times.length - 1;
  const arcFractions = times.map((_, index) => {
    const curveIndex = Math.round((index / lastIndex) * divisions);
    return lengths[curveIndex] / totalLength;
  });
  return createMonotoneInterpolator(times, arcFractions, options);
};

const sampleTimedCurve = (curve, timeline, progress, target) => {
  const curveProgress = clamp01(timeline(progress));
  curve.getPointAt(curveProgress, target);
  return curveProgress;
};

const sampleTimedNumber = (values, times, progress) => {
  const lastIndex = values.length - 1;

  if (progress <= times[0]) {
    return values[0];
  }

  if (progress >= times[lastIndex]) {
    return values[lastIndex];
  }

  let index = 0;
  while (index < lastIndex && progress > times[index + 1]) {
    index += 1;
  }

  const local = smootherStep(rangeProgress(progress, times[index], times[index + 1]));
  return THREE.MathUtils.lerp(values[index], values[index + 1], local);
};

const setInstance = (mesh, index, scratch, position, scale, rotation = null) => {
  scratch.position.copy(position);
  scratch.scale.copy(scale);
  scratch.rotation.set(
    rotation?.x ?? 0,
    rotation?.y ?? 0,
    rotation?.z ?? 0,
  );
  scratch.updateMatrix();
  mesh.setMatrixAt(index, scratch.matrix);
};

const setCylinderBetween = (mesh, index, scratch, start, end, radius) => {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(0.0001, direction.length());
  scratch.position.copy(start).add(end).multiplyScalar(0.5);
  scratch.scale.set(radius, length, radius);
  scratch.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  scratch.updateMatrix();
  mesh.setMatrixAt(index, scratch.matrix);
};

const createStructuralFrame = ({
  width,
  height,
  depth,
  thickness,
  material,
  name,
}) => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const bars = new THREE.InstancedMesh(geometry, material, 12);
  const scratch = new THREE.Object3D();
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const halfDepth = depth / 2;
  let index = 0;

  for (const x of [-halfWidth, halfWidth]) {
    for (const z of [-halfDepth, halfDepth]) {
      setInstance(
        bars,
        index,
        scratch,
        new THREE.Vector3(x, 0, z),
        new THREE.Vector3(thickness, height, thickness),
      );
      index += 1;
    }
  }

  for (const y of [-halfHeight, halfHeight]) {
    for (const z of [-halfDepth, halfDepth]) {
      setInstance(
        bars,
        index,
        scratch,
        new THREE.Vector3(0, y, z),
        new THREE.Vector3(width, thickness, thickness),
      );
      index += 1;
    }
  }

  for (const x of [-halfWidth, halfWidth]) {
    for (const y of [-halfHeight, halfHeight]) {
      setInstance(
        bars,
        index,
        scratch,
        new THREE.Vector3(x, y, 0),
        new THREE.Vector3(thickness, thickness, depth),
      );
      index += 1;
    }
  }

  bars.name = name;
  bars.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  bars.computeBoundingSphere();
  return bars;
};

const createBulkhead = ({
  x = 0,
  y = 1,
  z,
  width = 30,
  height = 20,
  openingWidth = 9,
  openingHeight = 11,
  depth = 1.5,
  material,
  name,
}) => {
  const group = new THREE.Group();
  const sideWidth = Math.max(1, (width - openingWidth) / 2);
  const topHeight = Math.max(1, height - openingHeight);
  const geometry = new THREE.BoxGeometry(1, 1, 1);

  const createSlab = (position, scale) => {
    const slab = new THREE.Mesh(geometry, material);
    slab.position.copy(position);
    slab.scale.copy(scale);
    group.add(slab);
    return slab;
  };

  createSlab(
    new THREE.Vector3(-(openingWidth + sideWidth) / 2, 0, 0),
    new THREE.Vector3(sideWidth, height, depth),
  );
  createSlab(
    new THREE.Vector3((openingWidth + sideWidth) / 2, 0, 0),
    new THREE.Vector3(sideWidth, height, depth),
  );
  createSlab(
    new THREE.Vector3(0, (openingHeight + topHeight) / 2, 0),
    new THREE.Vector3(openingWidth, topHeight, depth),
  );

  group.position.set(x, y, z);
  group.name = name;
  return group;
};

const createUnavailableController = ({ onStatus, reason }) => {
  let progress = 0;
  let frames = 0;

  try {
    onStatus?.({
      state: 'fallback',
      reason,
      renderer: 'fallback',
      renderState: 'fallback',
      gpu: 'fallback',
      quality: 'fallback',
    });
  } catch {
    // Status reporting must never prevent the semantic fallback from loading.
  }

  return {
    setProgress(nextProgress) {
      progress = clamp01(nextProgress);
    },
    resize() {},
    pause() {},
    resume() {},
    dispose() {},
    snapshot() {
      return {
        progress,
        beat: getBeat(progress),
        beatId: getBeat(progress),
        beatIndex: getBeatIndex(progress),
        cameraPosition: null,
        core: { uuid: null, worldPosition: null },
        frames,
        renderer: 'none',
        rendererCount: 0,
        rendererId: null,
        quality: 'fallback',
        renderState: 'fallback',
        paused: true,
      };
    },
  };
};

/**
 * Creates the autonomous-foundry world.
 *
 * The renderer owns one scene, camera, core, and WebGL context for its complete
 * lifetime. All authored camera and narrative state is a pure function of the
 * normalized progress supplied to setProgress(), so seeking and reversing do
 * not require replaying hidden state.
 */
export function createFoundryWorld({
  canvas,
  reducedMotion = false,
  onStatus,
} = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    return createUnavailableController({
      onStatus,
      reason: 'A canvas element is required.',
    });
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: true,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      // The journey exposes deterministic frame capture for visual regression
      // and art-direction review, so the last completed frame must remain
      // readable between RAF callbacks.
      preserveDrawingBuffer: true,
    });
  } catch (error) {
    return createUnavailableController({
      onStatus,
      reason: error instanceof Error ? error.message : 'WebGL initialization failed.',
    });
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 420);
  const world = new THREE.Group();
  const rendererContext = renderer.getContext();
  const rendererDebugInfo = rendererContext.getExtension?.('WEBGL_debug_renderer_info');
  const rendererName = rendererDebugInfo
    ? rendererContext.getParameter(rendererDebugInfo.UNMASKED_RENDERER_WEBGL)
    : rendererContext.getParameter(rendererContext.RENDERER);
  const softwareRenderer = isSoftwareRenderer(rendererName);
  const initialQuality = chooseQuality(canvas, rendererName);
  let quality = initialQuality;
  let qualityConfig = QUALITY[quality];
  let progress = 0;
  let velocity = 0;
  let frames = 0;
  let animationFrame = 0;
  let disposed = false;
  let contextLost = false;
  let lastFrameTime = 0;
  let qualityWindowStarted = 0;
  let qualityWindowFrames = 0;
  const pauseReasons = new Set();
  const pixelRatio =
    typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1);
  const rendererId = THREE.MathUtils.generateUUID();
  const rendererType = renderer.capabilities.isWebGL2 ? 'webgl2' : 'webgl1';

  const notify = (state, detail = {}) => {
    try {
      onStatus?.({
        state,
        renderer: rendererType,
        rendererName,
        quality,
        ...detail,
      });
    } catch {
      // Observability callbacks are deliberately isolated from rendering.
    }
  };

  notify('initializing');

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(PALETTE.ivory, 1);

  scene.background = new THREE.Color(PALETTE.ivory);
  scene.fog = new THREE.Fog(0xe9e5dc, 46, 176);
  scene.add(world);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environmentRenderTarget = pmremGenerator.fromScene(
    roomEnvironment,
    0.04,
    0.1,
    100,
    {
      size: quality === 'high' ? 256 : quality === 'balanced' ? 128 : 64,
    },
  );
  roomEnvironment.dispose?.();
  scene.environment = environmentRenderTarget.texture;
  scene.environmentIntensity = 0.82;

  const materials = {
    ivory: new THREE.MeshPhysicalMaterial({
      color: PALETTE.ivory,
      roughness: 0.68,
      metalness: 0.04,
      clearcoat: 0.12,
      clearcoatRoughness: 0.58,
    }),
    chalk: new THREE.MeshPhysicalMaterial({
      color: PALETTE.chalk,
      roughness: 0.84,
      metalness: 0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.68,
    }),
    graphite: new THREE.MeshPhysicalMaterial({
      color: PALETTE.graphite,
      roughness: 0.26,
      metalness: 0.8,
      clearcoat: 0.28,
      clearcoatRoughness: 0.22,
    }),
    black: new THREE.MeshPhysicalMaterial({
      color: PALETTE.black,
      roughness: 0.14,
      metalness: 0.82,
      clearcoat: 0.92,
      clearcoatRoughness: 0.09,
    }),
    steel: new THREE.MeshPhysicalMaterial({
      color: PALETTE.steel,
      roughness: 0.34,
      metalness: 0.76,
      clearcoat: 0.12,
    }),
    coolSteel: new THREE.MeshPhysicalMaterial({
      color: PALETTE.coolSteel,
      roughness: 0.27,
      metalness: 0.78,
      clearcoat: 0.2,
    }),
    brass: new THREE.MeshPhysicalMaterial({
      color: PALETTE.brass,
      roughness: 0.2,
      metalness: 0.94,
      anisotropy: 0.72,
      anisotropyRotation: Math.PI / 2,
      clearcoat: 0.18,
      clearcoatRoughness: 0.16,
    }),
    amber: new THREE.MeshPhysicalMaterial({
      color: PALETTE.amber,
      emissive: PALETTE.ember,
      emissiveIntensity: 1.45,
      roughness: 0.18,
      metalness: 0.38,
      clearcoat: 0.46,
      clearcoatRoughness: 0.16,
    }),
    validationAmber: new THREE.MeshPhysicalMaterial({
      color: PALETTE.amber,
      emissive: PALETTE.ember,
      emissiveIntensity: 0.82,
      roughness: 0.24,
      metalness: 0.72,
      clearcoat: 0.32,
    }),
    reject: new THREE.MeshPhysicalMaterial({
      color: PALETTE.reject,
      roughness: 0.6,
      metalness: 0.3,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xc8d2d4,
      roughness: 0.14,
      metalness: 0,
      transmission: quality === 'low' ? 0.28 : 0.68,
      thickness: 0.85,
      ior: 1.42,
      transparent: true,
      opacity: quality === 'low' ? 0.44 : 0.62,
      depthWrite: false,
    }),
    scannerGlass: new THREE.MeshPhysicalMaterial({
      color: 0xd8e1df,
      roughness: 0.1,
      transmission: quality === 'low' ? 0.12 : 0.5,
      thickness: 0.25,
      transparent: true,
      opacity: quality === 'low' ? 0.18 : 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    connection: new THREE.MeshPhysicalMaterial({
      color: 0x5c625f,
      roughness: 0.4,
      metalness: 0.65,
    }),
    shadow: new THREE.MeshBasicMaterial({
      color: PALETTE.black,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      toneMapped: false,
    }),
    dust: new THREE.PointsMaterial({
      color: PALETTE.brass,
      size: quality === 'low' ? 0.09 : 0.075,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      toneMapped: false,
    }),
  };

  const hemisphere = new THREE.HemisphereLight(PALETTE.chalk, 0x514b42, 1.45);
  const keyLight = new THREE.DirectionalLight(0xfff8e9, 3.65);
  keyLight.position.set(-16, 28, 18);
  keyLight.castShadow = quality !== 'low';
  keyLight.shadow.mapSize.set(
    quality === 'high' ? 2048 : 1024,
    quality === 'high' ? 2048 : 1024,
  );
  keyLight.shadow.camera.left = -48;
  keyLight.shadow.camera.right = 48;
  keyLight.shadow.camera.top = 42;
  keyLight.shadow.camera.bottom = -42;
  keyLight.shadow.camera.near = 2;
  keyLight.shadow.camera.far = 260;
  keyLight.shadow.bias = -0.00016;
  const rimLight = new THREE.DirectionalLight(0xbad5e0, 1.85);
  rimLight.position.set(24, 12, -70);
  const warmFill = new THREE.DirectionalLight(0xffc276, 0.72);
  warmFill.position.set(-24, 4, -150);
  scene.add(hemisphere, keyLight, rimLight, warmFill);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 430),
    materials.chalk,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(24, -4, -105);
  floor.name = 'foundry-floor';
  floor.receiveShadow = quality !== 'low';
  world.add(floor);

  const intentCore = new THREE.Group();
  intentCore.name = 'persistent-intent-core';

  const coreShell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.72, quality === 'low' ? 2 : 3),
    materials.black,
  );
  coreShell.name = 'intent-core-shell';
  coreShell.castShadow = quality !== 'low';
  const coreEmber = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.29, 2),
    materials.amber,
  );
  coreEmber.name = 'intent-core-ember';
  const coreSeam = new THREE.Mesh(
    new THREE.TorusGeometry(0.76, 0.055, 8, qualityConfig.radialSegments),
    materials.validationAmber,
  );
  coreSeam.name = 'intent-core-seam';
  coreSeam.rotation.x = Math.PI / 2;
  const coreEdgeMaterial = new THREE.LineBasicMaterial({
    color: PALETTE.brass,
    transparent: true,
    opacity: 0.24,
    toneMapped: false,
  });
  const coreEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(coreShell.geometry, 28),
    coreEdgeMaterial,
  );
  coreEdges.scale.setScalar(1.006);
  coreEdges.name = 'intent-core-faceted-signal';
  const coreLight = new THREE.PointLight(PALETTE.amber, quality === 'low' ? 9 : 15, 18, 1.8);
  const coreShadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.45, 32),
    materials.shadow,
  );
  coreShadow.rotation.x = -Math.PI / 2;
  coreShadow.position.y = -3.94;
  coreShadow.name = 'intent-core-contact-shadow';

  intentCore.add(coreShell, coreEmber, coreSeam, coreEdges, coreLight);
  world.add(intentCore, coreShadow);

  const corridor = new THREE.Group();
  corridor.name = 'execution-machinery-corridor';
  const corridorBox = new RoundedBoxGeometry(
    1,
    1,
    1,
    quality === 'low' ? 1 : 3,
    quality === 'low' ? 0.045 : 0.085,
  );
  const framePieces = new THREE.InstancedMesh(
    corridorBox,
    materials.ivory,
    qualityConfig.corridorFrames * 3,
  );
  const pressHeads = new THREE.InstancedMesh(
    corridorBox,
    materials.graphite,
    qualityConfig.corridorFrames,
  );
  const workStreams = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.78),
    materials.brass,
    qualityConfig.streamCount,
  );
  const frameScratch = new THREE.Object3D();
  let framePieceIndex = 0;

  for (let index = 0; index < qualityConfig.corridorFrames; index += 1) {
    const z = -12 - index * 4.25;
    setInstance(
      framePieces,
      framePieceIndex,
      frameScratch,
      new THREE.Vector3(-5, 0.5, z),
      new THREE.Vector3(0.58, 9, 0.76),
    );
    framePieceIndex += 1;
    setInstance(
      framePieces,
      framePieceIndex,
      frameScratch,
      new THREE.Vector3(5, 0.5, z),
      new THREE.Vector3(0.58, 9, 0.76),
    );
    framePieceIndex += 1;
    setInstance(
      framePieces,
      framePieceIndex,
      frameScratch,
      new THREE.Vector3(0, 5, z),
      new THREE.Vector3(10.6, 0.5, 0.76),
    );
    framePieceIndex += 1;
  }

  framePieces.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  framePieces.computeBoundingSphere();
  pressHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  workStreams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const railGeometry = new THREE.BoxGeometry(0.25, 0.18, 61);
  for (const x of [-1.3, 0, 1.3]) {
    const rail = new THREE.Mesh(railGeometry, materials.steel);
    rail.position.set(x, -3.65, -40);
    corridor.add(rail);
  }

  corridor.add(framePieces, pressHeads, workStreams);
  world.add(corridor);

  const validationBulkhead = createBulkhead({
    z: -73,
    width: 36,
    height: 23,
    openingWidth: 22,
    openingHeight: 18,
    material: materials.ivory,
    name: 'validation-transition-bulkhead',
  });
  world.add(validationBulkhead);

  const validation = new THREE.Group();
  validation.position.set(0, 1.5, -82);
  validation.rotation.y = -0.16;
  validation.name = 'physical-validation-scanner';
  const validationOuter = new THREE.Mesh(
    new THREE.TorusGeometry(5.05, 0.48, 16, qualityConfig.radialSegments),
    materials.graphite,
  );
  validationOuter.castShadow = quality !== 'low';
  const validationRail = new THREE.Mesh(
    new THREE.TorusGeometry(4.34, 0.09, 10, qualityConfig.radialSegments),
    materials.brass,
  );
  const validationInner = new THREE.Mesh(
    new THREE.TorusGeometry(3.7, 0.14, 10, qualityConfig.radialSegments),
    materials.validationAmber,
  );
  const validationMembrane = new THREE.Mesh(
    new THREE.CircleGeometry(3.52, qualityConfig.radialSegments),
    materials.scannerGlass,
  );
  validationMembrane.position.z = -0.12;

  const irisBladeShape = new THREE.Shape();
  irisBladeShape.moveTo(1.22, -0.16);
  irisBladeShape.lineTo(3.66, -0.48);
  irisBladeShape.quadraticCurveTo(3.93, -0.18, 3.72, 0.19);
  irisBladeShape.lineTo(1.34, 0.35);
  irisBladeShape.quadraticCurveTo(1.08, 0.12, 1.22, -0.16);
  const irisBladeGeometry = new THREE.ExtrudeGeometry(irisBladeShape, {
    depth: 0.18,
    bevelEnabled: quality !== 'low',
    bevelSegments: quality === 'high' ? 2 : 1,
    bevelSize: 0.055,
    bevelThickness: 0.045,
    curveSegments: quality === 'low' ? 2 : 4,
  });
  irisBladeGeometry.translate(0, 0, -0.09);
  const irisAssembly = new THREE.Group();
  const irisBlades = [];
  const irisCount = quality === 'low' ? 8 : 12;
  for (let index = 0; index < irisCount; index += 1) {
    const blade = new THREE.Mesh(irisBladeGeometry, materials.coolSteel);
    blade.rotation.z = (index / irisCount) * Math.PI * 2;
    blade.position.z = 0.02 + index * 0.012;
    blade.castShadow = quality !== 'low';
    irisBlades.push(blade);
    irisAssembly.add(blade);
  }

  const scannerLatchGeometry = new RoundedBoxGeometry(
    0.72,
    0.36,
    0.52,
    quality === 'low' ? 1 : 2,
    0.08,
  );
  const scannerLatches = new THREE.InstancedMesh(
    scannerLatchGeometry,
    materials.brass,
    10,
  );
  for (let index = 0; index < scannerLatches.count; index += 1) {
    const angle = (index / scannerLatches.count) * Math.PI * 2;
    setInstance(
      scannerLatches,
      index,
      frameScratch,
      new THREE.Vector3(Math.cos(angle) * 5.08, Math.sin(angle) * 5.08, 0.06),
      new THREE.Vector3(1, 1, 1),
      new THREE.Euler(0, 0, angle),
    );
  }
  scannerLatches.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const scanBeam = new THREE.Mesh(
    new RoundedBoxGeometry(6.55, 0.075, 0.12, 2, 0.035),
    materials.validationAmber,
  );
  scanBeam.position.z = 0.38;
  const validationLight = new THREE.PointLight(PALETTE.amber, 8, 24, 1.8);
  validationLight.position.z = 1.3;

  validation.add(
    validationMembrane,
    irisAssembly,
    validationRail,
    validationInner,
    validationOuter,
    scannerLatches,
    scanBeam,
    validationLight,
  );

  const fragments = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.52, 0),
    materials.reject,
    qualityConfig.fragmentCount,
  );
  fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fragments.name = 'rejected-validation-fragments';
  validation.add(fragments);
  world.add(validation);

  const fragmentRandom = createSeededRandom(0x51a7e);
  const fragmentSeeds = Array.from({ length: qualityConfig.fragmentCount }, (_, index) => {
    const angle = fragmentRandom() * Math.PI * 2;
    return {
      angle,
      radius: 1.2 + fragmentRandom() * 3.7,
      drift: 4 + fragmentRandom() * 9,
      fall: 7 + fragmentRandom() * 14,
      spin: 2 + fragmentRandom() * 8,
      scale: 0.35 + fragmentRandom() * 0.9,
      delay: (index / Math.max(1, qualityConfig.fragmentCount - 1)) * 0.32,
    };
  });

  const frontierTransition = new THREE.Group();
  frontierTransition.position.set(0, 1, -98);
  frontierTransition.name = 'frontier-physical-occluder';
  for (const direction of [-1, 1]) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(12, 22, 2.4),
      materials.ivory,
    );
    blade.position.x = direction * 10.5;
    blade.rotation.y = direction * 0.34;
    frontierTransition.add(blade);
  }
  world.add(frontierTransition);

  const frontiers = new THREE.Group();
  frontiers.name = 'applications-research-bifurcation';

  const applicationRail = new THREE.Group();
  for (const x of [-11.2, -9, -6.8]) {
    const rail = new THREE.Mesh(
      new RoundedBoxGeometry(0.22, 0.16, 56, 2, 0.045),
      materials.steel,
    );
    rail.position.set(x, -3.65, -125);
    applicationRail.add(rail);
  }
  frontiers.add(applicationRail);

  const applicationMachines = new THREE.InstancedMesh(
    corridorBox,
    materials.graphite,
    qualityConfig.applicationCount,
  );
  const applicationPackets = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.45, 0.3, 0.7),
    materials.validationAmber,
    qualityConfig.applicationCount,
  );
  applicationMachines.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  applicationPackets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  frontiers.add(applicationMachines, applicationPackets);

  const researchHall = new THREE.Group();
  researchHall.name = 'slow-research-hall';
  const researchChambers = [];
  const researchCount = quality === 'low' ? 4 : 6;

  for (let index = 0; index < researchCount; index += 1) {
    const chamber = new THREE.Group();
    const scale = 0.92 + index * 0.045;
    const gimbalOuter = new THREE.Mesh(
      new THREE.TorusGeometry(
        1.9,
        0.12,
        10,
        qualityConfig.radialSegments,
      ),
      materials.coolSteel,
    );
    const gimbalInner = new THREE.Mesh(
      new THREE.TorusGeometry(
        1.48,
        0.09,
        10,
        qualityConfig.radialSegments,
      ),
      materials.validationAmber,
    );
    gimbalInner.rotation.x = Math.PI / 2;
    const cellShell = new THREE.Mesh(
      new THREE.CapsuleGeometry(
        0.66,
        1.38,
        quality === 'low' ? 3 : 6,
        quality === 'low' ? 8 : 14,
      ),
      materials.glass,
    );
    const cellCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.38, quality === 'low' ? 0 : 1),
      materials.validationAmber,
    );
    const cellCapTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.72, 0.24, qualityConfig.radialSegments),
      materials.graphite,
    );
    const cellCapBottom = cellCapTop.clone();
    cellCapTop.position.y = 1.08;
    cellCapBottom.position.y = -1.08;
    const pedestal = new THREE.Mesh(
      new RoundedBoxGeometry(2.5, 0.28, 2.1, 2, 0.09),
      materials.ivory,
    );
    pedestal.position.y = -2.08;
    const chamberScan = new THREE.Mesh(
      new RoundedBoxGeometry(1.55, 0.055, 0.055, 2, 0.02),
      materials.validationAmber,
    );
    chamberScan.position.z = 0.78;
    chamber.add(
      pedestal,
      gimbalOuter,
      gimbalInner,
      cellShell,
      cellCore,
      cellCapTop,
      cellCapBottom,
      chamberScan,
    );
    chamber.scale.setScalar(scale);
    chamber.position.set(
      11.5 + (index % 2) * 3.7,
      -0.4 + (index % 3) * 3.35,
      -106 - index * 8.35,
    );
    researchChambers.push({
      group: chamber,
      outer: gimbalOuter,
      inner: gimbalInner,
      core: cellCore,
      scan: chamberScan,
      phase: index * 0.61,
    });
    researchHall.add(chamber);
  }

  const applicationLight = new THREE.PointLight(0x6e74a9, 8, 38, 2);
  applicationLight.position.set(-9, 4, -125);
  const researchLight = new THREE.PointLight(0x9eb8c7, 8, 44, 2);
  researchLight.position.set(16, 7, -132);
  frontiers.add(researchHall, applicationLight, researchLight);
  world.add(frontiers);

  const organizationBulkhead = createBulkhead({
    x: 40,
    y: 5,
    z: -181,
    width: 60,
    height: 30,
    openingWidth: 28,
    openingHeight: 22,
    depth: 1.8,
    material: materials.chalk,
    name: 'organization-scale-transition',
  });
  world.add(organizationBulkhead);

  const organization = new THREE.Group();
  organization.position.set(48, 7, -205);
  organization.name = 'company-cro-lab-nested-reveal';
  const companyFrame = createStructuralFrame({
    width: 10,
    height: 8,
    depth: 10,
    thickness: 0.34,
    material: materials.graphite,
    name: 'company-frame',
  });
  const croFrame = createStructuralFrame({
    width: 25,
    height: 16,
    depth: 23,
    thickness: 0.5,
    material: materials.brass,
    name: 'cro-frame',
  });
  const labFrame = createStructuralFrame({
    width: 50,
    height: 28,
    depth: 42,
    thickness: 0.62,
    material: materials.ivory,
    name: 'lab-frame',
  });
  organization.add(companyFrame, croFrame, labFrame);

  const organizationCount = qualityConfig.organizationCount;
  const cellPositions = [];
  const autonomousCells = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.72, quality === 'low' ? 0 : 1),
    materials.steel,
    organizationCount,
  );
  const cellRandom = createSeededRandom(0xc011ab);
  for (let index = 0; index < organizationCount; index += 1) {
    const column = index % 4;
    const row = Math.floor(index / 4) % 3;
    const layer = Math.floor(index / 12);
    const position = new THREE.Vector3(
      (column - 1.5) * 4.2 + (layer === 0 ? -1.4 : 1.4),
      (row - 1) * 3.6 + (cellRandom() - 0.5) * 0.55,
      -7.5 + (index % 6) * 3 + layer * 1.25,
    );
    cellPositions.push(position);
    setInstance(
      autonomousCells,
      index,
      frameScratch,
      position,
      new THREE.Vector3().setScalar(0.62 + cellRandom() * 0.46),
      new THREE.Euler(
        cellRandom() * Math.PI,
        cellRandom() * Math.PI,
        cellRandom() * Math.PI,
      ),
    );
  }
  autonomousCells.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  autonomousCells.computeBoundingSphere();
  const connectionPairs = cellPositions.slice(1).map((end, index) => ({
    start: cellPositions[Math.floor(index / 2)],
    end,
  }));
  const organizationConnections = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 6),
    materials.connection,
    connectionPairs.length,
  );
  connectionPairs.forEach((pair, index) => {
    setCylinderBetween(
      organizationConnections,
      index,
      frameScratch,
      pair.start,
      pair.end,
      0.055,
    );
  });
  organizationConnections.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  organizationConnections.computeBoundingSphere();

  const organizationPulses = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.18, quality === 'low' ? 8 : 12, quality === 'low' ? 6 : 8),
    materials.validationAmber,
    connectionPairs.length,
  );
  organizationPulses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const organizationLight = new THREE.PointLight(PALETTE.brass, 7, 34, 1.9);
  organizationLight.position.set(0, 2, 1);
  organization.add(
    organizationConnections,
    autonomousCells,
    organizationPulses,
    organizationLight,
  );
  world.add(organization);

  const founderGate = new THREE.Group();
  founderGate.position.set(48, 7, -242);
  founderGate.name = 'brass-founder-boundary';
  const founderArch = createStructuralFrame({
    width: 19,
    height: 17,
    depth: 4,
    thickness: 0.9,
    material: materials.brass,
    name: 'founder-gate-frame',
  });
  const founderInnerArch = createStructuralFrame({
    width: 16.8,
    height: 14.8,
    depth: 2.7,
    thickness: 0.28,
    material: materials.graphite,
    name: 'founder-gate-inner-frame',
  });
  founderInnerArch.position.z = 0.28;

  const gatePanelGeometry = new RoundedBoxGeometry(
    2.25,
    13.1,
    0.72,
    quality === 'low' ? 1 : 4,
    quality === 'low' ? 0.08 : 0.16,
  );
  const gateAccentGeometry = new RoundedBoxGeometry(0.07, 10.8, 0.78, 2, 0.025);
  const leftGatePanels = [];
  const rightGatePanels = [];
  for (let index = 0; index < 3; index += 1) {
    for (const direction of [-1, 1]) {
      const panel = new THREE.Mesh(gatePanelGeometry, materials.graphite);
      const baseX = direction * (1.2 + index * 2.42);
      panel.position.set(baseX, 0, 0.34 + index * 0.035);
      panel.castShadow = quality !== 'low';
      panel.receiveShadow = quality !== 'low';
      panel.userData.baseX = baseX;
      panel.userData.direction = direction;
      panel.userData.delay = index * 0.08;
      panel.name = direction < 0
        ? `founder-gate-left-panel-${index + 1}`
        : `founder-gate-right-panel-${index + 1}`;
      const accent = new THREE.Mesh(gateAccentGeometry, materials.validationAmber);
      accent.position.set(direction * -0.84, 0, 0.02);
      panel.add(accent);
      if (direction < 0) {
        leftGatePanels.push(panel);
      } else {
        rightGatePanels.push(panel);
      }
    }
  }
  const gatePanels = [...leftGatePanels, ...rightGatePanels];

  const sealAssembly = new THREE.Group();
  sealAssembly.position.z = 0.92;
  const leftSeal = new THREE.Mesh(
    new THREE.CircleGeometry(
      1.18,
      qualityConfig.radialSegments,
      Math.PI / 2,
      Math.PI,
    ),
    materials.validationAmber,
  );
  const rightSeal = new THREE.Mesh(
    new THREE.CircleGeometry(
      1.18,
      qualityConfig.radialSegments,
      -Math.PI / 2,
      Math.PI,
    ),
    materials.validationAmber,
  );
  const sealRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.38, 0.12, 10, qualityConfig.radialSegments),
    materials.brass,
  );
  sealAssembly.add(leftSeal, rightSeal, sealRing);

  const founderBacklight = new THREE.PointLight(PALETTE.amber, 12, 42, 1.7);
  founderBacklight.position.set(0, 0, -7);
  const threshold = new THREE.Mesh(
    new RoundedBoxGeometry(17, 0.48, 15, 3, 0.12),
    materials.brass,
  );
  threshold.position.set(0, -7.75, 5.5);
  threshold.receiveShadow = quality !== 'low';

  const beyond = new THREE.Group();
  const beyondPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(14.5, 12.4),
    new THREE.MeshBasicMaterial({ color: 0xe8dfce, toneMapped: false }),
  );
  beyondPlane.position.z = -16;
  beyond.add(beyondPlane);
  for (let index = 0; index < 4; index += 1) {
    const beyondFrame = createStructuralFrame({
      width: 14 - index * 1.6,
      height: 12 - index * 1.25,
      depth: 0.6,
      thickness: 0.16,
      material: index % 2 === 0 ? materials.brass : materials.graphite,
      name: `founder-beyond-frame-${index + 1}`,
    });
    beyondFrame.position.z = -3.5 - index * 3.2;
    beyond.add(beyondFrame);
  }
  const horizonSignal = new THREE.Mesh(
    new RoundedBoxGeometry(0.12, 8, 0.12, 2, 0.035),
    materials.validationAmber,
  );
  horizonSignal.position.z = -14.8;
  beyond.add(horizonSignal);

  founderGate.add(
    beyond,
    founderArch,
    founderInnerArch,
    ...leftGatePanels,
    ...rightGatePanels,
    sealAssembly,
    founderBacklight,
    threshold,
  );
  world.add(founderGate);

  const dustRandom = createSeededRandom(0xd057);
  const dustPositions = new Float32Array(qualityConfig.dustCount * 3);
  for (let index = 0; index < qualityConfig.dustCount; index += 1) {
    const region = index / qualityConfig.dustCount;
    dustPositions[index * 3] = THREE.MathUtils.lerp(-14, 74, dustRandom());
    dustPositions[index * 3 + 1] = -2 + dustRandom() * 23;
    dustPositions[index * 3 + 2] = THREE.MathUtils.lerp(
      region < 0.46 ? 4 : -88,
      region < 0.46 ? -94 : -270,
      dustRandom(),
    );
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, materials.dust);
  dust.name = 'restrained-atmospheric-dust';
  world.add(dust);

  const cameraCurve = new THREE.CatmullRomCurve3(
    CAMERA_POINTS.map(vector),
    false,
    'centripetal',
    0.45,
  );
  const lookCurve = new THREE.CatmullRomCurve3(
    LOOK_POINTS.map(vector),
    false,
    'centripetal',
    0.42,
  );
  const coreCurve = new THREE.CatmullRomCurve3(
    CORE_POINTS.map(vector),
    false,
    'centripetal',
    0.44,
  );
  const cameraTimeline = createArcLengthTimeline(cameraCurve, CAMERA_TIMES, {
    startAtRest: true,
    endAtRest: true,
  });
  const lookTimeline = createArcLengthTimeline(lookCurve, CAMERA_TIMES, {
    startAtRest: true,
    endAtRest: true,
  });
  const coreTimeline = createArcLengthTimeline(coreCurve, CORE_TIMES, {
    startAtRest: true,
    endAtRest: true,
  });

  const cameraPosition = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const corePosition = new THREE.Vector3();
  const coreWorldPosition = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const viewDirection = new THREE.Vector3();
  const viewRight = new THREE.Vector3();
  const viewUp = new THREE.Vector3();
  const instancePosition = new THREE.Vector3();
  const instanceScale = new THREE.Vector3();
  const instanceRotation = new THREE.Euler();
  const dynamicScratch = new THREE.Object3D();
  const signalColor = new THREE.Color();
  const signalEmissive = new THREE.Color();
  const signalStops = [
    {
      progress: 0,
      color: new THREE.Color(0x7465ae),
      emissive: new THREE.Color(0x3e326f),
      intensity: 0.5,
    },
    {
      progress: 0.25,
      color: new THREE.Color(0x7187a2),
      emissive: new THREE.Color(0x334f70),
      intensity: 0.46,
    },
    {
      progress: 0.42,
      color: new THREE.Color(0x2c9c9c),
      emissive: new THREE.Color(0x0d656d),
      intensity: 0.62,
    },
    {
      progress: 0.625,
      color: new THREE.Color(0x4aa9a3),
      emissive: new THREE.Color(0x1a6666),
      intensity: 0.52,
    },
    {
      progress: 0.81,
      color: new THREE.Color(PALETTE.brass),
      emissive: new THREE.Color(0x714819),
      intensity: 0.38,
    },
    {
      progress: 0.88,
      color: new THREE.Color(PALETTE.amber),
      emissive: new THREE.Color(PALETTE.ember),
      intensity: 1.05,
    },
    {
      progress: 1,
      color: new THREE.Color(0xff8d12),
      emissive: new THREE.Color(0xff4f00),
      intensity: 1.28,
    },
  ];
  let signalEmissiveIntensity = signalStops[0].intensity;
  let viewportAspect = 1;

  const setRendererQuality = (nextQuality, reason = 'adaptive') => {
    if (!QUALITY[nextQuality] || quality === nextQuality || disposed) {
      return;
    }

    quality = nextQuality;
    qualityConfig = QUALITY[quality];
    const nextDpr = Math.min(pixelRatio, qualityConfig.dpr);
    renderer.setPixelRatio(nextDpr);
    renderer.shadowMap.enabled = quality !== 'low';
    keyLight.castShadow = quality !== 'low';
    floor.receiveShadow = quality !== 'low';
    dust.visible = quality !== 'low';
    materials.glass.transmission = quality === 'low' ? 0.28 : 0.68;
    materials.scannerGlass.transmission = quality === 'low' ? 0.12 : 0.5;
    pressHeads.count = Math.min(pressHeads.instanceMatrix.count, qualityConfig.corridorFrames);
    workStreams.count = Math.min(workStreams.instanceMatrix.count, qualityConfig.streamCount);
    fragments.count = Math.min(fragments.instanceMatrix.count, qualityConfig.fragmentCount);
    applicationMachines.count = Math.min(
      applicationMachines.instanceMatrix.count,
      qualityConfig.applicationCount,
    );
    applicationPackets.count = Math.min(
      applicationPackets.instanceMatrix.count,
      qualityConfig.applicationCount,
    );
    autonomousCells.count = Math.min(
      autonomousCells.instanceMatrix.count,
      qualityConfig.organizationCount,
    );
    organizationConnections.count = Math.min(
      organizationConnections.instanceMatrix.count,
      Math.max(0, qualityConfig.organizationCount - 1),
    );
    organizationPulses.count = Math.min(
      organizationPulses.instanceMatrix.count,
      Math.max(0, qualityConfig.organizationCount - 1),
    );
    notify('quality', { reason, dpr: nextDpr });
    resize();
  };

  const updateSignalColor = (currentProgress) => {
    let index = 0;
    while (
      index < signalStops.length - 2 &&
      currentProgress > signalStops[index + 1].progress
    ) {
      index += 1;
    }

    const before = signalStops[index];
    const after = signalStops[Math.min(signalStops.length - 1, index + 1)];
    const local = smootherStep(
      rangeProgress(currentProgress, before.progress, after.progress),
    );
    signalColor.lerpColors(before.color, after.color, local);
    signalEmissive.lerpColors(before.emissive, after.emissive, local);
    signalEmissiveIntensity = THREE.MathUtils.lerp(
      before.intensity,
      after.intensity,
      local,
    );

    materials.amber.color.copy(signalColor);
    materials.amber.emissive.copy(signalEmissive);
    materials.amber.emissiveIntensity = signalEmissiveIntensity * 1.18;
    materials.validationAmber.color.copy(signalColor);
    materials.validationAmber.emissive.copy(signalEmissive);
    materials.validationAmber.emissiveIntensity = signalEmissiveIntensity;
    coreEdgeMaterial.color.copy(signalColor);
    coreLight.color.copy(signalColor);
    validationLight.color.copy(signalColor);
    applicationLight.color.copy(signalColor);
    organizationLight.color.copy(signalColor);
    founderBacklight.color.copy(signalColor);
  };

  const updateExecution = (currentProgress) => {
    const local = rangeProgress(currentProgress, 0.08, 0.33);

    for (let index = 0; index < qualityConfig.corridorFrames; index += 1) {
      const phase = local * Math.PI * 19 - index * 0.83;
      const compression = Math.pow(Math.max(0, Math.sin(phase)), 6);
      instancePosition.set(0, 3.8 - compression * 4.4, -12 - index * 4.25);
      instanceScale.set(5.6, 0.54, 1.18);
      setInstance(
        pressHeads,
        index,
        dynamicScratch,
        instancePosition,
        instanceScale,
      );
    }
    pressHeads.instanceMatrix.needsUpdate = true;

    for (let index = 0; index < qualityConfig.streamCount; index += 1) {
      const lane = index % 3;
      const laneIndex = Math.floor(index / 3);
      const cycle = (laneIndex / Math.ceil(qualityConfig.streamCount / 3) + local * 1.9) % 1;
      instancePosition.set(-1.3 + lane * 1.3, -3.25, -10 - cycle * 60);
      instanceScale.set(1, 1, 1);
      instanceRotation.set(0, 0, 0);
      setInstance(
        workStreams,
        index,
        dynamicScratch,
        instancePosition,
        instanceScale,
        instanceRotation,
      );
    }
    workStreams.instanceMatrix.needsUpdate = true;
  };

  const updateValidation = (currentProgress) => {
    const local = rangeProgress(currentProgress, 0.29, 0.46);
    const inspection = smootherStep(rangeProgress(currentProgress, 0.31, 0.41));
    validationOuter.rotation.z = local * Math.PI * 0.42;
    validationRail.rotation.z = -local * Math.PI * 1.35;
    validationInner.rotation.z = local * Math.PI * 2.1;
    validationMembrane.rotation.z = -local * Math.PI * 0.24;
    scanBeam.position.y = THREE.MathUtils.lerp(3.15, -3.15, inspection);
    scanBeam.scale.x = 0.72 + Math.sin(inspection * Math.PI) * 0.28;
    scanBeam.scale.y = 1 + Math.sin(inspection * Math.PI) * 2.4;
    irisBlades.forEach((blade, index) => {
      const angle = (index / irisBlades.length) * Math.PI * 2;
      blade.rotation.z =
        angle +
        THREE.MathUtils.lerp(0.19, -0.08, Math.sin(inspection * Math.PI));
    });
    materials.validationAmber.emissiveIntensity =
      signalEmissiveIntensity + Math.pow(Math.sin(inspection * Math.PI), 4) * 0.72;
    validationLight.intensity =
      4.5 + Math.pow(Math.sin(inspection * Math.PI), 4) * 12;

    for (let index = 0; index < fragmentSeeds.length; index += 1) {
      const seed = fragmentSeeds[index];
      const activation = smootherStep(
        rangeProgress(local, seed.delay, Math.min(1, seed.delay + 0.55)),
      );
      const radial = seed.radius + activation * seed.drift;
      instancePosition.set(
        Math.cos(seed.angle) * radial,
        Math.sin(seed.angle) * seed.radius - activation * activation * seed.fall,
        activation * (2 + index * 0.035),
      );
      const visibleScale = Math.max(0.001, activation * seed.scale);
      instanceScale.setScalar(visibleScale);
      instanceRotation.set(
        activation * seed.spin,
        activation * seed.spin * 0.72,
        seed.angle + activation * seed.spin * 0.35,
      );
      setInstance(
        fragments,
        index,
        dynamicScratch,
        instancePosition,
        instanceScale,
        instanceRotation,
      );
    }
    fragments.instanceMatrix.needsUpdate = true;
  };

  const updateFrontiers = (currentProgress) => {
    const local = rangeProgress(currentProgress, 0.42, 0.68);

    for (let index = 0; index < qualityConfig.applicationCount; index += 1) {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const z = -103 - row * 4.6;
      const phase = local * Math.PI * 42 - index * 0.62;
      const stroke = 0.5 + 0.5 * Math.sin(phase);

      instancePosition.set(-11.3 + column * 2.3, -1 + stroke * 3.6, z);
      instanceScale.set(1.25, 1.5 + stroke * 1.7, 1.25);
      setInstance(
        applicationMachines,
        index,
        dynamicScratch,
        instancePosition,
        instanceScale,
      );

      const packetCycle = (index / qualityConfig.applicationCount + local * 4.1) % 1;
      instancePosition.set(-9, -3.05, -101 - packetCycle * 51);
      instanceScale.setScalar(0.72 + stroke * 0.32);
      setInstance(
        applicationPackets,
        index,
        dynamicScratch,
        instancePosition,
        instanceScale,
      );
    }
    applicationMachines.instanceMatrix.needsUpdate = true;
    applicationPackets.instanceMatrix.needsUpdate = true;

    for (let index = 0; index < researchChambers.length; index += 1) {
      const chamber = researchChambers[index];
      const cadence = local * Math.PI * (0.72 + index * 0.08) + chamber.phase;
      chamber.group.rotation.y = Math.sin(cadence * 0.42) * 0.18;
      chamber.outer.rotation.x = cadence * 0.42;
      chamber.outer.rotation.y = cadence * 0.16;
      chamber.inner.rotation.y = -cadence * 0.7;
      chamber.inner.rotation.z = cadence * 0.54;
      chamber.core.rotation.set(cadence * 0.32, cadence * 0.65, cadence * 0.18);
      chamber.scan.position.y = Math.sin(cadence * 1.4) * 0.84;
    }
  };

  const updateScale = (currentProgress) => {
    const local = rangeProgress(currentProgress, 0.61, 0.84);
    const companyReveal = smootherStep(rangeProgress(currentProgress, 0.61, 0.675));
    const croReveal = smootherStep(rangeProgress(currentProgress, 0.655, 0.73));
    const labReveal = smootherStep(rangeProgress(currentProgress, 0.7, 0.79));
    const cellReveal = smootherStep(rangeProgress(currentProgress, 0.645, 0.755));

    companyFrame.scale.setScalar(Math.max(0.001, companyReveal));
    croFrame.scale.setScalar(Math.max(0.001, croReveal));
    labFrame.scale.setScalar(Math.max(0.001, labReveal));
    companyFrame.rotation.z = (1 - companyReveal) * -0.18;
    croFrame.rotation.z = (1 - croReveal) * 0.12;
    labFrame.rotation.z = (1 - labReveal) * -0.07;
    autonomousCells.scale.setScalar(Math.max(0.001, cellReveal));
    organizationConnections.scale.setScalar(Math.max(0.001, croReveal));
    organizationPulses.scale.setScalar(Math.max(0.001, cellReveal));
    organizationBulkhead.visible = currentProgress >= 0.57 && currentProgress <= 0.825;

    for (let index = 0; index < connectionPairs.length; index += 1) {
      const pair = connectionPairs[index];
      const cycle = (index / connectionPairs.length + local * 2.15) % 1;
      instancePosition.copy(pair.start).lerp(pair.end, cycle);
      instanceScale.setScalar(0.58 + Math.sin(cycle * Math.PI) * 0.6);
      setInstance(
        organizationPulses,
        index,
        dynamicScratch,
        instancePosition,
        instanceScale,
      );
    }
    organizationPulses.instanceMatrix.needsUpdate = true;
    organizationLight.intensity = 2 + labReveal * 8;
  };

  const updateBoundary = (currentProgress) => {
    founderGate.visible = currentProgress >= 0.775;
    const sealLocal = smootherStep(rangeProgress(currentProgress, 0.82, 0.875));
    const doorLocal = smootherStep(rangeProgress(currentProgress, 0.855, 0.985));
    leftSeal.position.x = -sealLocal * 0.92;
    rightSeal.position.x = sealLocal * 0.92;
    leftSeal.rotation.z = -sealLocal * 0.32;
    rightSeal.rotation.z = sealLocal * 0.32;
    sealRing.scale.setScalar(1 - sealLocal * 0.24);
    sealRing.rotation.z = sealLocal * Math.PI * 0.72;

    gatePanels.forEach((panel) => {
      const panelLocal = smootherStep(
        rangeProgress(
          currentProgress,
          0.855 + panel.userData.delay * 0.18,
          0.95 + panel.userData.delay * 0.14,
        ),
      );
      const direction = panel.userData.direction;
      panel.position.x =
        panel.userData.baseX +
        direction * panelLocal * (5.25 + panel.userData.delay * 4.2);
      panel.position.z = 0.34 - panelLocal * (0.36 + panel.userData.delay);
      panel.rotation.y =
        direction * panelLocal * (0.12 + panel.userData.delay * 0.58);
    });

    sealAssembly.scale.setScalar(1 - doorLocal * 0.12);
    founderBacklight.intensity = 3 + doorLocal * 32;
  };

  const updateScene = (timeSeconds) => {
    const cameraCurveProgress = sampleTimedCurve(
      cameraCurve,
      cameraTimeline,
      progress,
      cameraPosition,
    );
    sampleTimedCurve(lookCurve, lookTimeline, progress, lookTarget);
    sampleTimedCurve(coreCurve, coreTimeline, progress, corePosition);

    camera.position.copy(cameraPosition);
    const mobileComposition = smootherStep(clamp01((1.08 - viewportAspect) / 0.52));
    viewDirection.subVectors(lookTarget, cameraPosition).normalize();
    viewRight.crossVectors(viewDirection, camera.up).normalize();
    viewUp.crossVectors(viewRight, viewDirection).normalize();
    camera.position.addScaledVector(viewDirection, -12.5 * mobileComposition);
    lookTarget
      .addScaledVector(viewRight, 1.9 * mobileComposition)
      .addScaledVector(viewUp, 8.3 * mobileComposition);
    camera.fov =
      sampleTimedNumber(CAMERA_FOV, CAMERA_TIMES, progress) +
      mobileComposition * 27;
    camera.updateProjectionMatrix();
    camera.lookAt(lookTarget);
    cameraCurve.getTangentAt(cameraCurveProgress, tangent);
    camera.rotateZ(THREE.MathUtils.clamp(-tangent.x * 0.055, -0.075, 0.075));

    updateSignalColor(progress);
    intentCore.position.copy(corePosition);
    intentCore.rotation.set(
      progress * Math.PI * 1.2,
      progress * Math.PI * 4.6,
      progress * Math.PI * 0.7,
    );
    coreShadow.position.x = corePosition.x;
    coreShadow.position.z = corePosition.z;
    coreShadow.scale.setScalar(0.72 + Math.max(0, corePosition.y + 1) * 0.045);
    materials.shadow.opacity = THREE.MathUtils.clamp(
      0.072 - Math.max(0, corePosition.y + 4) * 0.011,
      0,
      0.072,
    );
    coreShadow.visible = quality === 'low' && materials.shadow.opacity > 0.006;

    const idlePulse = reducedMotion ? 0 : Math.sin(timeSeconds * 2.2) * 0.035;
    coreEmber.scale.setScalar(1 + idlePulse + Math.min(0.1, Math.abs(velocity) * 0.002));
    coreSeam.rotation.z = progress * Math.PI * 5.2;
    coreLight.intensity =
      (quality === 'low' ? 6.5 : 10.5) +
      signalEmissiveIntensity * 3 +
      (reducedMotion ? 0 : Math.sin(timeSeconds * 1.7) * 0.45);

    updateExecution(progress);
    updateValidation(progress);
    updateFrontiers(progress);
    updateScale(progress);
    updateBoundary(progress);

    if (!reducedMotion) {
      dust.rotation.y = timeSeconds * 0.008;
      dust.position.y = Math.sin(timeSeconds * 0.09) * 0.18;
    }
  };

  const renderFrame = (now = performance.now()) => {
    if (disposed || contextLost) {
      return;
    }

    const timeSeconds = now * 0.001;
    updateScene(timeSeconds);
    renderer.render(scene, camera);
    frames += 1;
    qualityWindowFrames += 1;

    if (!qualityWindowStarted) {
      qualityWindowStarted = now;
    }

    const qualityWindowDuration = now - qualityWindowStarted;
    if (qualityWindowDuration >= 1800 && !reducedMotion) {
      const measuredFps = (qualityWindowFrames * 1000) / qualityWindowDuration;
      if (quality === 'high' && measuredFps < 47) {
        setRendererQuality('balanced', 'frame-budget');
      } else if (quality === 'balanced' && measuredFps < 35) {
        setRendererQuality('low', 'frame-budget');
      }
      qualityWindowStarted = now;
      qualityWindowFrames = 0;
    }

    lastFrameTime = now;
  };

  const loop = (now) => {
    animationFrame = 0;
    if (disposed || pauseReasons.size > 0 || contextLost || reducedMotion) {
      return;
    }

    renderFrame(now);
    animationFrame = requestAnimationFrame(loop);
  };

  const startLoop = () => {
    if (
      disposed ||
      contextLost ||
      reducedMotion ||
      softwareRenderer ||
      pauseReasons.size > 0 ||
      animationFrame
    ) {
      return;
    }
    animationFrame = requestAnimationFrame(loop);
  };

  const stopLoop = () => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
  };

  function resize() {
    if (disposed) {
      return;
    }

    const width = Math.max(
      1,
      Math.round(canvas.clientWidth || (typeof window === 'undefined' ? 1 : window.innerWidth)),
    );
    const height = Math.max(
      1,
      Math.round(canvas.clientHeight || (typeof window === 'undefined' ? 1 : window.innerHeight)),
    );
    renderer.setPixelRatio(Math.min(pixelRatio, QUALITY[quality].dpr));
    renderer.setSize(width, height, false);
    viewportAspect = width / height;
    const canvasMask = viewportAspect < 0.82 ? NARROW_SCREEN_CANVAS_MASK : '';
    canvas.style.maskImage = canvasMask;
    canvas.style.webkitMaskImage = canvasMask;
    camera.aspect = viewportAspect;
    camera.updateProjectionMatrix();

    if (reducedMotion && pauseReasons.size === 0 && !contextLost) {
      renderFrame(lastFrameTime || performance.now());
    }
  }

  const onVisibilityChange = () => {
    if (document.hidden) {
      pauseReasons.add('visibility');
      stopLoop();
      notify('paused', { reason: 'visibility' });
    } else {
      pauseReasons.delete('visibility');
      notify('resumed', { reason: 'visibility' });
      if (pauseReasons.size > 0 || contextLost) {
        return;
      }
      if (reducedMotion || softwareRenderer) {
        renderFrame(performance.now());
      } else {
        startLoop();
      }
    }
  };

  const onContextLost = (event) => {
    event.preventDefault();
    contextLost = true;
    pauseReasons.add('context');
    stopLoop();
    notify('context-lost');
  };

  const onContextRestored = () => {
    contextLost = false;
    pauseReasons.delete('context');
    resize();
    notify('context-restored');
    if (pauseReasons.size === 0) {
      if (reducedMotion || softwareRenderer) {
        renderFrame(performance.now());
      } else {
        startLoop();
      }
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  if (document.hidden) {
    pauseReasons.add('visibility');
  }

  resize();
  if (pauseReasons.size === 0) {
    renderFrame(performance.now());
    startLoop();
  }
  notify('ready', {
    dpr: renderer.getPixelRatio(),
    beat: getBeat(progress),
    renderState: reducedMotion ? 'static' : 'active',
    gpu: 'ready',
  });

  return {
    setProgress(nextProgress, nextVelocity = 0) {
      if (disposed) {
        return;
      }

      progress = clamp01(nextProgress);
      velocity = THREE.MathUtils.clamp(
        Number.isFinite(nextVelocity) ? nextVelocity : 0,
        -120,
        120,
      );
      const now = performance.now();

      if (pauseReasons.size > 0 || contextLost) {
        updateScene(now * 0.001);
        return;
      }

      if (reducedMotion || softwareRenderer) {
        renderFrame(now);
      } else {
        updateScene(now * 0.001);
        startLoop();
      }
    },

    resize,

    pause() {
      if (disposed) {
        return;
      }
      pauseReasons.add('manual');
      stopLoop();
      notify('paused', { reason: 'manual' });
    },

    resume() {
      if (disposed) {
        return;
      }
      pauseReasons.delete('manual');
      notify('resumed', { reason: 'manual' });
      if (pauseReasons.size > 0 || contextLost) {
        return;
      }
      if (reducedMotion || softwareRenderer) {
        renderFrame(performance.now());
      } else {
        startLoop();
      }
    },

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      stopLoop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('webglcontextlost', onContextLost, false);
      canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
      canvas.style.removeProperty('mask-image');
      canvas.style.removeProperty('-webkit-mask-image');

      const geometries = new Set();
      const disposableMaterials = new Set();
      scene.traverse((object) => {
        if (object.geometry) {
          geometries.add(object.geometry);
        }
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => disposableMaterials.add(material));
        } else if (object.material) {
          disposableMaterials.add(object.material);
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      disposableMaterials.forEach((material) => material.dispose());
      scene.environment = null;
      environmentRenderTarget.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
      notify('disposed');
    },

    snapshot() {
      intentCore.getWorldPosition(coreWorldPosition);
      return {
        progress,
        beat: getBeat(progress),
        beatId: getBeat(progress),
        beatIndex: getBeatIndex(progress),
        cameraPosition: [
          Number(camera.position.x.toFixed(4)),
          Number(camera.position.y.toFixed(4)),
          Number(camera.position.z.toFixed(4)),
        ],
        core: {
          uuid: intentCore.uuid,
          worldPosition: [
            Number(coreWorldPosition.x.toFixed(4)),
            Number(coreWorldPosition.y.toFixed(4)),
            Number(coreWorldPosition.z.toFixed(4)),
          ],
        },
        frames,
        renderer: rendererType,
        rendererCount: 1,
        rendererId,
        rendererName,
        quality,
        renderState: reducedMotion
          ? 'static'
          : pauseReasons.size > 0 || contextLost
            ? 'paused'
            : 'active',
        paused: pauseReasons.size > 0 || contextLost,
      };
    },
  };
}

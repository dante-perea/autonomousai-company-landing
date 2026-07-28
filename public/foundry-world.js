import * as THREE from 'three';

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

const QUALITY = Object.freeze({
  low: {
    dpr: 0.8,
    corridorFrames: 9,
    streamCount: 24,
    fragmentCount: 16,
    applicationCount: 18,
    dustCount: 70,
    radialSegments: 20,
  },
  balanced: {
    dpr: 1.1,
    corridorFrames: 12,
    streamCount: 36,
    fragmentCount: 24,
    applicationCount: 26,
    dustCount: 120,
    radialSegments: 32,
  },
  high: {
    dpr: 1.5,
    corridorFrames: 15,
    streamCount: 48,
    fragmentCount: 34,
    applicationCount: 36,
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
  0.79,
  0.81,
]);

const CAMERA_POINTS = Object.freeze([
  [0, 2.4, 18],
  [0.7, 2.2, 9],
  [-1.8, 1.2, -14],
  [2.4, 0.6, -37],
  [0.2, 1.1, -67],
  [5, 2.6, -74],
  [-7, 4.2, -97],
  [0, 6, -122],
  [2, 7, -150],
  [33, 8, -168],
  [42, 10, -176],
  [45, 15, -154],
  [63, 10, -128],
  [75, 7, -121],
]);

const LOOK_POINTS = Object.freeze([
  [0, 0.8, 0],
  [0, 0.8, -4],
  [0, 0.2, -24],
  [0, 0.3, -50],
  [0, 1.5, -82],
  [0, 1.5, -82],
  [-9, 0, -115],
  [3, 3, -133],
  [24, 6, -177],
  [42, 7, -205],
  [42, 7, -205],
  [42, 7, -205],
  [74, 5, -150],
  [75, 5, -150],
]);

const CAMERA_FOV = Object.freeze([
  48,
  43,
  50,
  54,
  46,
  39,
  51,
  46,
  52,
  45,
  38,
  50,
  43,
  41,
]);

const CORE_TIMES = Object.freeze([
  0,
  0.1,
  0.2,
  0.31,
  0.4,
  0.52,
  0.64,
  0.74,
  0.82,
  0.9,
]);

const CORE_POINTS = Object.freeze([
  [0, 0.8, 0],
  [0, 0.8, -8],
  [0, 0.2, -35],
  [0, 1.5, -70],
  [0, 1.5, -82],
  [-8, 1, -108],
  [8, 3, -136],
  [24, 6, -175],
  [42, 7, -205],
  [75, 5, -141],
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

const chooseQuality = (canvas) => {
  const deviceMemory = typeof navigator === 'undefined' ? 8 : navigator.deviceMemory ?? 8;
  const cores = typeof navigator === 'undefined' ? 8 : navigator.hardwareConcurrency ?? 8;
  const saveData =
    typeof navigator !== 'undefined' && Boolean(navigator.connection?.saveData);
  const width =
    canvas?.clientWidth || (typeof window === 'undefined' ? 1440 : window.innerWidth);
  const height =
    canvas?.clientHeight || (typeof window === 'undefined' ? 900 : window.innerHeight);
  const compact = Math.min(width, height) < 640;

  if (saveData || deviceMemory <= 2 || cores <= 4) {
    return 'low';
  }

  if (compact || deviceMemory <= 4 || cores < 8) {
    return 'balanced';
  }

  return 'high';
};

const timelineCurvePosition = (times, progress) => {
  const lastIndex = times.length - 1;

  if (progress <= times[0]) {
    return 0;
  }

  if (progress >= times[lastIndex]) {
    return 1;
  }

  let index = 0;
  while (index < lastIndex && progress > times[index + 1]) {
    index += 1;
  }

  const local = rangeProgress(progress, times[index], times[index + 1]);
  return (index + smootherStep(local)) / lastIndex;
};

const sampleTimedCurve = (curve, times, progress, target) => {
  const curveProgress = timelineCurvePosition(times, progress);
  curve.getPoint(curveProgress, target);
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
  const initialQuality = chooseQuality(canvas);
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
  const rendererContext = renderer.getContext();
  const rendererId = THREE.MathUtils.generateUUID();
  const rendererType = renderer.capabilities.isWebGL2 ? 'webgl2' : 'webgl1';
  const rendererDebugInfo = rendererContext.getExtension?.('WEBGL_debug_renderer_info');
  const rendererName = rendererDebugInfo
    ? rendererContext.getParameter(rendererDebugInfo.UNMASKED_RENDERER_WEBGL)
    : rendererContext.getParameter(rendererContext.RENDERER);

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
  renderer.toneMappingExposure = 0.94;
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(PALETTE.ivory, 1);

  scene.background = new THREE.Color(PALETTE.ivory);
  scene.fog = new THREE.Fog(PALETTE.ivory, 24, 112);
  scene.add(world);

  const materials = {
    ivory: new THREE.MeshStandardMaterial({
      color: PALETTE.ivory,
      roughness: 0.78,
      metalness: 0.03,
    }),
    chalk: new THREE.MeshStandardMaterial({
      color: PALETTE.chalk,
      roughness: 0.92,
      metalness: 0,
    }),
    graphite: new THREE.MeshStandardMaterial({
      color: PALETTE.graphite,
      roughness: 0.34,
      metalness: 0.72,
    }),
    black: new THREE.MeshStandardMaterial({
      color: PALETTE.black,
      roughness: 0.2,
      metalness: 0.9,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: PALETTE.steel,
      roughness: 0.43,
      metalness: 0.68,
    }),
    coolSteel: new THREE.MeshStandardMaterial({
      color: PALETTE.coolSteel,
      roughness: 0.38,
      metalness: 0.72,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: PALETTE.brass,
      roughness: 0.28,
      metalness: 0.88,
    }),
    amber: new THREE.MeshStandardMaterial({
      color: PALETTE.amber,
      emissive: PALETTE.ember,
      emissiveIntensity: 2.3,
      roughness: 0.22,
      metalness: 0.45,
    }),
    validationAmber: new THREE.MeshStandardMaterial({
      color: PALETTE.amber,
      emissive: PALETTE.ember,
      emissiveIntensity: 1.3,
      roughness: 0.3,
      metalness: 0.66,
    }),
    reject: new THREE.MeshStandardMaterial({
      color: PALETTE.reject,
      roughness: 0.72,
      metalness: 0.22,
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

  const hemisphere = new THREE.HemisphereLight(PALETTE.chalk, 0x4a4338, 2.2);
  const keyLight = new THREE.DirectionalLight(PALETTE.chalk, 3.2);
  keyLight.position.set(-16, 28, 18);
  const rimLight = new THREE.DirectionalLight(0xd1dae0, 1.2);
  rimLight.position.set(24, 12, -70);
  scene.add(hemisphere, keyLight, rimLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 430),
    materials.chalk,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(24, -4, -105);
  floor.name = 'foundry-floor';
  world.add(floor);

  const intentCore = new THREE.Group();
  intentCore.name = 'persistent-intent-core';

  const coreShell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.72, quality === 'low' ? 2 : 3),
    materials.black,
  );
  coreShell.name = 'intent-core-shell';
  const coreEmber = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.29, 2),
    materials.amber,
  );
  coreEmber.name = 'intent-core-ember';
  const coreSeam = new THREE.Mesh(
    new THREE.TorusGeometry(0.76, 0.055, 8, qualityConfig.radialSegments),
    materials.brass,
  );
  coreSeam.name = 'intent-core-seam';
  coreSeam.rotation.x = Math.PI / 2;
  const coreLight = new THREE.PointLight(PALETTE.amber, quality === 'low' ? 9 : 15, 18, 1.8);
  const coreShadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.45, 32),
    materials.shadow,
  );
  coreShadow.rotation.x = -Math.PI / 2;
  coreShadow.position.y = -3.94;
  coreShadow.name = 'intent-core-contact-shadow';

  intentCore.add(coreShell, coreEmber, coreSeam, coreLight);
  world.add(intentCore, coreShadow);

  const corridor = new THREE.Group();
  corridor.name = 'execution-machinery-corridor';
  const corridorBox = new THREE.BoxGeometry(1, 1, 1);
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
    openingWidth: 9,
    openingHeight: 12,
    material: materials.ivory,
    name: 'validation-transition-bulkhead',
  });
  world.add(validationBulkhead);

  const validation = new THREE.Group();
  validation.position.set(0, 1.5, -82);
  validation.name = 'physical-validation-ring';
  const validationOuter = new THREE.Mesh(
    new THREE.TorusGeometry(5.25, 0.38, 12, qualityConfig.radialSegments),
    materials.graphite,
  );
  const validationInner = new THREE.Mesh(
    new THREE.TorusGeometry(3.8, 0.18, 10, qualityConfig.radialSegments),
    materials.validationAmber,
  );
  const validationHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.82, 0.72, qualityConfig.radialSegments),
    materials.brass,
  );
  validationHub.rotation.x = Math.PI / 2;
  validationHub.position.z = -0.15;
  validation.add(validationOuter, validationInner, validationHub);

  const spokeGeometry = new THREE.BoxGeometry(0.18, 4.1, 0.22);
  const spokes = new THREE.InstancedMesh(spokeGeometry, materials.steel, 16);
  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * Math.PI * 2;
    setInstance(
      spokes,
      index,
      frameScratch,
      new THREE.Vector3(Math.sin(angle) * 2.35, Math.cos(angle) * 2.35, 0),
      new THREE.Vector3(1, 1, 1),
      new THREE.Euler(0, 0, -angle),
    );
  }
  spokes.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  validation.add(spokes);

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

  const applicationRail = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.28, 56),
    materials.steel,
  );
  applicationRail.position.set(-9, -3.65, -125);
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
    const chamberBody = new THREE.Mesh(
      new THREE.SphereGeometry(
        1.9 + index * 0.12,
        quality === 'low' ? 16 : 24,
        quality === 'low' ? 10 : 16,
      ),
      index % 2 === 0 ? materials.coolSteel : materials.ivory,
    );
    const chamberRing = new THREE.Mesh(
      new THREE.TorusGeometry(
        2.5 + index * 0.12,
        0.16,
        8,
        qualityConfig.radialSegments,
      ),
      materials.brass,
    );
    chamberRing.rotation.x = Math.PI / 2;
    chamber.add(chamberBody, chamberRing);
    chamber.position.set(
      14 + (index % 2) * 3.2,
      -1 + (index % 3) * 3.1,
      -106 - index * 8.2,
    );
    researchChambers.push(chamber);
    researchHall.add(chamber);
  }

  const applicationLight = new THREE.PointLight(PALETTE.amber, 10, 38, 2);
  applicationLight.position.set(-9, 4, -125);
  const researchLight = new THREE.PointLight(0x9eb8c7, 8, 44, 2);
  researchLight.position.set(9, 7, -132);
  frontiers.add(researchHall, applicationLight, researchLight);
  world.add(frontiers);

  const organizationBulkhead = createBulkhead({
    x: 42,
    y: 3,
    z: -181,
    width: 52,
    height: 29,
    openingWidth: 12,
    openingHeight: 14,
    depth: 2.2,
    material: materials.chalk,
    name: 'organization-scale-transition',
  });
  world.add(organizationBulkhead);

  const organization = new THREE.Group();
  organization.position.set(42, 7, -205);
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
    width: 24,
    height: 16,
    depth: 22,
    thickness: 0.5,
    material: materials.brass,
    name: 'cro-frame',
  });
  const labFrame = createStructuralFrame({
    width: 48,
    height: 28,
    depth: 42,
    thickness: 0.72,
    material: materials.ivory,
    name: 'lab-frame',
  });
  organization.add(companyFrame, croFrame, labFrame);

  const autonomousCells = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.4, 1.4, 1.4),
    materials.steel,
    quality === 'low' ? 12 : 24,
  );
  const cellRandom = createSeededRandom(0xc011ab);
  for (let index = 0; index < autonomousCells.count; index += 1) {
    const radius = 6 + cellRandom() * 14;
    const angle = cellRandom() * Math.PI * 2;
    setInstance(
      autonomousCells,
      index,
      frameScratch,
      new THREE.Vector3(
        Math.cos(angle) * radius,
        -9 + cellRandom() * 18,
        Math.sin(angle) * radius,
      ),
      new THREE.Vector3(
        0.45 + cellRandom() * 1.1,
        0.45 + cellRandom() * 1.1,
        0.45 + cellRandom() * 1.1,
      ),
      new THREE.Euler(
        cellRandom() * Math.PI,
        cellRandom() * Math.PI,
        cellRandom() * Math.PI,
      ),
    );
  }
  autonomousCells.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  autonomousCells.computeBoundingSphere();
  organization.add(autonomousCells);
  world.add(organization);

  const founderGate = new THREE.Group();
  founderGate.position.set(75, 5, -150);
  founderGate.name = 'brass-founder-boundary';
  const founderArch = createStructuralFrame({
    width: 18,
    height: 16,
    depth: 3,
    thickness: 0.85,
    material: materials.brass,
    name: 'founder-gate-frame',
  });
  const founderLeftDoor = new THREE.Mesh(
    new THREE.BoxGeometry(7.2, 13.2, 1.2),
    materials.graphite,
  );
  const founderRightDoor = founderLeftDoor.clone();
  founderLeftDoor.name = 'founder-gate-left-door';
  founderRightDoor.name = 'founder-gate-right-door';
  founderLeftDoor.position.x = -3.65;
  founderRightDoor.position.x = 3.65;

  const decisionSeal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.15, 0.38, qualityConfig.radialSegments),
    materials.validationAmber,
  );
  decisionSeal.rotation.x = Math.PI / 2;
  decisionSeal.position.z = 0.82;
  const founderBacklight = new THREE.PointLight(PALETTE.amber, 14, 38, 1.7);
  founderBacklight.position.set(0, 0, -5);
  const threshold = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.5, 14),
    materials.brass,
  );
  threshold.position.set(0, -7.75, 5.5);

  founderGate.add(
    founderArch,
    founderLeftDoor,
    founderRightDoor,
    decisionSeal,
    founderBacklight,
    threshold,
  );
  world.add(founderGate);

  const dustRandom = createSeededRandom(0xd057);
  const dustPositions = new Float32Array(qualityConfig.dustCount * 3);
  for (let index = 0; index < qualityConfig.dustCount; index += 1) {
    const region = index / qualityConfig.dustCount;
    dustPositions[index * 3] = THREE.MathUtils.lerp(-14, 90, dustRandom());
    dustPositions[index * 3 + 1] = -2 + dustRandom() * 23;
    dustPositions[index * 3 + 2] = THREE.MathUtils.lerp(
      region < 0.5 ? 4 : -85,
      region < 0.5 ? -92 : -198,
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

  const cameraPosition = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const corePosition = new THREE.Vector3();
  const coreWorldPosition = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const instancePosition = new THREE.Vector3();
  const instanceScale = new THREE.Vector3();
  const instanceRotation = new THREE.Euler();
  const dynamicScratch = new THREE.Object3D();

  const setRendererQuality = (nextQuality, reason = 'adaptive') => {
    if (!QUALITY[nextQuality] || quality === nextQuality || disposed) {
      return;
    }

    quality = nextQuality;
    qualityConfig = QUALITY[quality];
    const nextDpr = Math.min(pixelRatio, qualityConfig.dpr);
    renderer.setPixelRatio(nextDpr);
    dust.visible = quality !== 'low';
    coreLight.intensity = quality === 'low' ? 9 : 15;
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
    notify('quality', { reason, dpr: nextDpr });
    resize();
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
    validationOuter.rotation.z = local * Math.PI * 2.2;
    validationInner.rotation.z = -local * Math.PI * 3.4;
    materials.validationAmber.emissiveIntensity =
      0.9 + Math.pow(Math.sin(local * Math.PI), 2) * 2.8;

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
      const cadence = local * Math.PI * (0.72 + index * 0.08);
      chamber.rotation.y = cadence;
      chamber.rotation.z = Math.sin(cadence * 0.6) * 0.12;
      chamber.children[1].rotation.z = -cadence * 1.25;
    }
  };

  const updateBoundary = (currentProgress) => {
    const local = smootherStep(rangeProgress(currentProgress, 0.82, 0.985));
    founderLeftDoor.position.x = -3.65 - local * 3.8;
    founderRightDoor.position.x = 3.65 + local * 3.8;
    decisionSeal.scale.setScalar(1 - local * 0.18);
    founderBacklight.intensity = 14 + local * 28;
  };

  const updateScene = (timeSeconds) => {
    const cameraCurveProgress = sampleTimedCurve(
      cameraCurve,
      CAMERA_TIMES,
      progress,
      cameraPosition,
    );
    sampleTimedCurve(lookCurve, CAMERA_TIMES, progress, lookTarget);
    sampleTimedCurve(coreCurve, CORE_TIMES, progress, corePosition);

    camera.position.copy(cameraPosition);
    camera.fov = sampleTimedNumber(CAMERA_FOV, CAMERA_TIMES, progress);
    camera.updateProjectionMatrix();
    camera.lookAt(lookTarget);
    cameraCurve.getTangent(cameraCurveProgress, tangent);
    camera.rotateZ(THREE.MathUtils.clamp(-tangent.x * 0.055, -0.075, 0.075));

    intentCore.position.copy(corePosition);
    intentCore.rotation.set(
      progress * Math.PI * 1.2,
      progress * Math.PI * 4.6,
      progress * Math.PI * 0.7,
    );
    coreShadow.position.x = corePosition.x;
    coreShadow.position.z = corePosition.z;
    coreShadow.scale.setScalar(1 + Math.max(0, corePosition.y + 1) * 0.09);
    materials.shadow.opacity = THREE.MathUtils.clamp(
      0.11 - Math.max(0, corePosition.y) * 0.007,
      0.025,
      0.11,
    );

    const idlePulse = reducedMotion ? 0 : Math.sin(timeSeconds * 2.2) * 0.035;
    coreEmber.scale.setScalar(1 + idlePulse + Math.min(0.1, Math.abs(velocity) * 0.002));
    coreSeam.rotation.z = progress * Math.PI * 5.2;
    coreLight.intensity =
      (quality === 'low' ? 9 : 15) + (reducedMotion ? 0 : Math.sin(timeSeconds * 1.7));

    updateExecution(progress);
    updateValidation(progress);
    updateFrontiers(progress);
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
    camera.aspect = width / height;
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
      if (reducedMotion) {
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
      if (reducedMotion) {
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
      updateScene(performance.now() * 0.001);

      if (pauseReasons.size > 0 || contextLost) {
        return;
      }

      if (reducedMotion) {
        renderFrame(performance.now());
      } else {
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
      if (reducedMotion) {
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

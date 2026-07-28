import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createEvolutionSystem } from './evolution-system.js';
import {
  storyBeatAt,
  storyBeatIndexAt,
  storyStageAt,
} from './foundry-story.js';

const PALETTE = Object.freeze({
  ivory: 0xe7e1d5,
  chalk: 0xf4efe5,
  graphite: 0x171613,
  titanium: 0x838782,
  violet: 0x7465ae,
  blue: 0x4d7f9d,
  teal: 0x2c9c9c,
  amber: 0xffa51f,
  ember: 0xff6b0a,
});

/**
 * Renderer quality remains deliberately separate from the evolution system's
 * authored composition. Lower tiers reduce raster and secondary detail, but
 * they do not change the camera, the persistent signal, or the story state.
 */
const QUALITY = Object.freeze({
  low: {
    tier: 'low',
    dpr: 0.8,
    environmentSize: 64,
    shadowSize: 512,
    particleCount: 420,
    entropyCount: 420,
    nodeCount: 72,
    linkCount: 84,
    atomCount: 18,
    bondCount: 32,
    dnaSegments: 44,
    intelligenceNodes: 34,
    proofNodes: 14,
    radialSegments: 14,
  },
  balanced: {
    tier: 'balanced',
    dpr: 1.1,
    environmentSize: 128,
    shadowSize: 1024,
    particleCount: 720,
    entropyCount: 720,
    nodeCount: 128,
    linkCount: 160,
    atomCount: 28,
    bondCount: 52,
    dnaSegments: 68,
    intelligenceNodes: 56,
    proofNodes: 22,
    radialSegments: 22,
  },
  high: {
    tier: 'high',
    dpr: 1.5,
    environmentSize: 256,
    shadowSize: 2048,
    particleCount: 1080,
    entropyCount: 1080,
    nodeCount: 192,
    linkCount: 240,
    atomCount: 40,
    bondCount: 72,
    dnaSegments: 92,
    intelligenceNodes: 78,
    proofNodes: 30,
    radialSegments: 32,
  },
});

/**
 * The stations occupy one continuous world along -Z. There are no scene swaps:
 * the evolution system morphs one seeded population between the stations while
 * this camera travels on one arc-length-controlled path.
 *
 * The last three camera points are intentionally identical. The judgement act
 * must feel like an arrival, not another fly-through, and the production tests
 * assert that the camera remains parked throughout the final decision hold.
 */
const CAMERA_TIMES = Object.freeze([
  0,
  0.055,
  0.105,
  0.19,
  0.275,
  0.355,
  0.425,
  0.525,
  0.625,
  0.72,
  0.81,
  0.86,
  0.93,
  1,
]);

const CAMERA_POINTS = Object.freeze([
  [7.5, 4.5, 18],
  [5.8, 3.6, 8],
  [4.5, 3.1, -7],
  [-2.8, 3.8, -24],
  [-4.2, 4.4, -42],
  [3.8, 4.9, -59],
  [6.2, 5.2, -76],
  [-4.8, 5.8, -94],
  [-7.2, 6.2, -111],
  [3.8, 6.6, -128],
  [8.5, 6.4, -149],
  [8.5, 6.4, -149],
  [8.5, 6.4, -149],
  [8.5, 6.4, -149],
]);

const LOOK_POINTS = Object.freeze([
  [0, 0.2, 0],
  [0, 0.3, -7],
  [0, 0.4, -20],
  [0, 0.8, -34],
  [0, 1.1, -51],
  [0, 1.6, -66],
  [0, 1.9, -83],
  [0, 2.2, -99],
  [0, 2.4, -116],
  [0, 2.5, -134],
  [0, 2.6, -164],
  [0, 2.6, -164],
  [0, 2.6, -164],
  [0, 2.6, -164],
]);

const CAMERA_FOV = Object.freeze([
  47,
  44,
  42,
  48,
  45,
  43,
  47,
  45,
  48,
  46,
  44,
  44,
  44,
  44,
]);

/**
 * The signal is the only persistent protagonist. It is not a literal particle
 * travelling from the early universe into a company. It is a visual invariant
 * for organized information: undirected, bound, encoded, actionable, verified,
 * and finally accountable. The system may render its own signal mesh, while
 * this anchor guarantees stable identity and an exact world-space snapshot.
 */
const CORE_TIMES = Object.freeze([
  0,
  0.105,
  0.275,
  0.425,
  0.625,
  0.81,
  0.855,
  0.9,
  1,
]);

const CORE_POINTS = Object.freeze([
  [0.9, 0.6, 0],
  [0.6, 0.8, -20],
  [-0.8, 1.2, -51],
  [0.5, 1.8, -83],
  [-0.4, 2.2, -116],
  [0.2, 2.5, -151],
  [0.1, 2.55, -160],
  [0, 2.6, -163.2],
  [0, 2.6, -163.2],
]);

const clamp01 = (value) =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

const smootherStep = (value) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

const rangeProgress = (progress, start, end) =>
  clamp01((progress - start) / Math.max(0.00001, end - start));

const vector = ([x, y, z]) => new THREE.Vector3(x, y, z);

const getBeatId = (progress) => {
  const beat = storyBeatAt(progress);
  return beat.id;
};

const isSoftwareRenderer = (rendererName = '') =>
  /swiftshader|llvmpipe|lavapipe|software rasterizer/i.test(rendererName);

const chooseQuality = (canvas, rendererName = '') => {
  const deviceMemory =
    typeof navigator === 'undefined' ? 8 : navigator.deviceMemory ?? 8;
  const cores =
    typeof navigator === 'undefined' ? 8 : navigator.hardwareConcurrency ?? 8;
  const saveData =
    typeof navigator !== 'undefined' && Boolean(navigator.connection?.saveData);
  const width =
    canvas?.clientWidth ||
    (typeof window === 'undefined' ? 1440 : window.innerWidth);
  const height =
    canvas?.clientHeight ||
    (typeof window === 'undefined' ? 900 : window.innerHeight);
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

/**
 * Monotone cubic interpolation keeps velocity finite around story hinges and
 * avoids the backward camera motion a free Catmull-Rom time mapping can cause.
 */
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
  const divisions = 800;
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

  const local = smootherStep(
    rangeProgress(progress, times[index], times[index + 1]),
  );
  return THREE.MathUtils.lerp(values[index], values[index + 1], local);
};

const createUnavailableController = ({ onStatus, reason }) => {
  let progress = 0;

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
    // Observability must never prevent the semantic fallback from loading.
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
        beat: getBeatId(progress),
        beatId: getBeatId(progress),
        beatIndex: storyBeatIndexAt(progress),
        storyStage: storyStageAt(progress),
        cameraPosition: null,
        core: { uuid: null, worldPosition: null },
        frames: 0,
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

const getEvolutionRoot = (evolution) =>
  evolution?.root ??
  evolution?.group ??
  evolution?.object3d ??
  evolution?.object ??
  null;

const getEvolutionCore = (evolution, fallback) =>
  evolution?.core ??
  evolution?.signal ??
  evolution?.persistentCore ??
  evolution?.persistentSignal ??
  fallback;

/**
 * Creates the continuous entropy-to-accountable-agency world.
 *
 * The renderer owns one scene, one camera, one persistent signal, and one WebGL
 * context for its complete lifetime. Every authored transformation is a pure
 * function of normalized progress. Seeking backward therefore reconstructs the
 * exact prior composition without replaying an irreversible simulation.
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
      // Deterministic frame capture is part of the production visual contract.
      preserveDrawingBuffer: true,
    });
  } catch (error) {
    return createUnavailableController({
      onStatus,
      reason:
        error instanceof Error ? error.message : 'WebGL initialization failed.',
    });
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 360);
  const world = new THREE.Group();
  world.name = 'continuous-evolution-world';
  scene.add(world);

  const rendererContext = renderer.getContext();
  const rendererDebugInfo = rendererContext.getExtension?.(
    'WEBGL_debug_renderer_info',
  );
  const rendererName = rendererDebugInfo
    ? rendererContext.getParameter(
        rendererDebugInfo.UNMASKED_RENDERER_WEBGL,
      )
    : rendererContext.getParameter(rendererContext.RENDERER);
  const softwareRenderer = isSoftwareRenderer(rendererName);
  const initialQuality = chooseQuality(canvas, rendererName);
  let quality = initialQuality;
  let progress = 0;
  let velocity = 0;
  let frames = 0;
  let animationFrame = 0;
  let disposed = false;
  let contextLost = false;
  let lastFrameTime = 0;
  let qualityWindowStarted = 0;
  let qualityWindowFrames = 0;
  let viewportAspect = 1;
  const pauseReasons = new Set();
  const pixelRatio =
    typeof window === 'undefined'
      ? 1
      : Math.max(1, window.devicePixelRatio || 1);
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
      // Rendering and semantic fallback do not depend on analytics callbacks.
    }
  };

  notify('initializing');

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(PALETTE.ivory, 1);

  scene.background = new THREE.Color(PALETTE.ivory);
  scene.fog = new THREE.Fog(PALETTE.ivory, 42, 132);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environmentRenderTarget = pmremGenerator.fromScene(
    roomEnvironment,
    0.04,
    0.1,
    100,
    { size: QUALITY[quality].environmentSize },
  );
  roomEnvironment.dispose?.();
  scene.environment = environmentRenderTarget.texture;
  scene.environmentIntensity = 0.86;

  /**
   * A compact, shared material family prevents each evolutionary state from
   * looking like a separate asset pack. The system may alias these materials,
   * but should not replace the physical language between stages.
   */
  const materials = {
    ceramic: new THREE.MeshPhysicalMaterial({
      color: PALETTE.ivory,
      roughness: 0.66,
      metalness: 0.03,
      clearcoat: 0.16,
      clearcoatRoughness: 0.54,
    }),
    titanium: new THREE.MeshPhysicalMaterial({
      color: PALETTE.titanium,
      roughness: 0.3,
      metalness: 0.78,
      clearcoat: 0.18,
      clearcoatRoughness: 0.24,
    }),
    graphite: new THREE.MeshPhysicalMaterial({
      color: PALETTE.graphite,
      roughness: 0.25,
      metalness: 0.76,
      clearcoat: 0.3,
      clearcoatRoughness: 0.2,
    }),
    probability: new THREE.MeshPhysicalMaterial({
      color: 0xbcc9d3,
      roughness: 0.12,
      metalness: 0,
      transmission: quality === 'low' ? 0.22 : 0.68,
      thickness: 0.72,
      ior: 1.38,
      transparent: true,
      opacity: quality === 'low' ? 0.38 : 0.56,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    signal: new THREE.MeshPhysicalMaterial({
      color: PALETTE.violet,
      emissive: 0x3e326f,
      emissiveIntensity: 0.78,
      roughness: 0.2,
      metalness: 0.34,
      clearcoat: 0.5,
      clearcoatRoughness: 0.14,
    }),
    verified: new THREE.MeshPhysicalMaterial({
      color: PALETTE.teal,
      emissive: 0x0d656d,
      emissiveIntensity: 0.66,
      roughness: 0.23,
      metalness: 0.5,
      clearcoat: 0.34,
    }),
    research: new THREE.MeshPhysicalMaterial({
      color: PALETTE.blue,
      emissive: 0x27455f,
      emissiveIntensity: 0.48,
      roughness: 0.28,
      metalness: 0.54,
      clearcoat: 0.24,
    }),
    accountability: new THREE.MeshPhysicalMaterial({
      color: PALETTE.amber,
      emissive: PALETTE.ember,
      emissiveIntensity: 1.08,
      roughness: 0.2,
      metalness: 0.5,
      clearcoat: 0.42,
      clearcoatRoughness: 0.16,
    }),
    connection: new THREE.MeshPhysicalMaterial({
      color: 0x656b68,
      roughness: 0.42,
      metalness: 0.66,
    }),
    shadow: new THREE.MeshBasicMaterial({
      color: PALETTE.graphite,
      transparent: true,
      opacity: 0.075,
      depthWrite: false,
      toneMapped: false,
    }),
    particle: new THREE.PointsMaterial({
      color: PALETTE.violet,
      size: quality === 'low' ? 0.085 : 0.065,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      toneMapped: false,
    }),
  };

  // Compatibility aliases retain one material identity, not duplicate assets.
  materials.ivory = materials.ceramic;
  materials.chalk = materials.ceramic;
  materials.steel = materials.titanium;
  materials.coolSteel = materials.titanium;
  materials.glass = materials.probability;
  materials.amber = materials.signal;
  materials.validationAmber = materials.verified;
  materials.brass = materials.accountability;
  materials.dust = materials.particle;

  /**
   * The light rig belongs to one quiet optical language. It changes emphasis as
   * the story advances, but never reconstructs the page as separate scenes.
   */
  const hemisphere = new THREE.HemisphereLight(
    PALETTE.chalk,
    0x615b52,
    1.72,
  );
  const keyLight = new THREE.DirectionalLight(0xfff8e9, 3.9);
  keyLight.position.set(-18, 30, 20);
  keyLight.castShadow = quality !== 'low';
  keyLight.shadow.mapSize.set(
    QUALITY[quality].shadowSize,
    QUALITY[quality].shadowSize,
  );
  keyLight.shadow.camera.left = -44;
  keyLight.shadow.camera.right = 44;
  keyLight.shadow.camera.top = 38;
  keyLight.shadow.camera.bottom = -38;
  keyLight.shadow.camera.near = 2;
  keyLight.shadow.camera.far = 250;
  keyLight.shadow.bias = -0.00016;

  const intelligenceRim = new THREE.DirectionalLight(0xb9d9e3, 1.7);
  intelligenceRim.position.set(25, 14, -84);

  const verifiedFill = new THREE.DirectionalLight(PALETTE.teal, 0.42);
  verifiedFill.position.set(-22, 8, -128);

  const boundaryLight = new THREE.PointLight(
    PALETTE.amber,
    quality === 'low' ? 6 : 10,
    34,
    1.7,
  );
  boundaryLight.position.set(0, 3, -166);

  scene.add(
    hemisphere,
    keyLight,
    intelligenceRim,
    verifiedFill,
    boundaryLight,
  );

  /**
   * This anchor is deliberately geometry-free. The evolution system may return
   * its own rendered core, but the anchor guarantees one stable UUID and one
   * continuous world position for diagnostics, testing, and integrations.
   */
  const coreAnchor = new THREE.Object3D();
  coreAnchor.name = 'persistent-evolution-signal';
  world.add(coreAnchor);

  let evolution;
  try {
    evolution = createEvolutionSystem({
      materials,
      qualityConfig: QUALITY[quality],
      persistentCore: coreAnchor,
    });
  } catch (error) {
    renderer.dispose();
    environmentRenderTarget.dispose();
    pmremGenerator.dispose();
    return createUnavailableController({
      onStatus,
      reason:
        error instanceof Error
          ? error.message
          : 'The evolution system could not initialize.',
    });
  }

  const evolutionRoot = getEvolutionRoot(evolution);
  if (
    evolutionRoot?.isObject3D &&
    evolutionRoot !== world &&
    !evolutionRoot.parent
  ) {
    world.add(evolutionRoot);
  }
  evolution?.setQuality?.(QUALITY[quality]);

  const cameraCurve = new THREE.CatmullRomCurve3(
    CAMERA_POINTS.map(vector),
    false,
    'centripetal',
    0.46,
  );
  const lookCurve = new THREE.CatmullRomCurve3(
    LOOK_POINTS.map(vector),
    false,
    'centripetal',
    0.44,
  );
  const coreCurve = new THREE.CatmullRomCurve3(
    CORE_POINTS.map(vector),
    false,
    'centripetal',
    0.45,
  );
  const cameraTimeline = createArcLengthTimeline(
    cameraCurve,
    CAMERA_TIMES,
    {
      startAtRest: true,
      endAtRest: true,
    },
  );
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

  const backgroundColor = new THREE.Color();
  const fogColor = new THREE.Color();
  const chalkColor = new THREE.Color(PALETTE.chalk);
  const evolutionUpdateState = {
    progress: 0,
    normalizedProgress: 0,
    stage: storyStageAt(0),
    storyStage: storyStageAt(0),
    time: 0,
    timeSeconds: 0,
    velocity: 0,
    quality,
    reducedMotion,
    viewportAspect,
    camera,
    cameraPosition,
    lookTarget,
    core: coreAnchor,
    corePosition,
  };
  const backgroundStops = [
    { progress: 0, color: new THREE.Color(0xe6e0d6) },
    { progress: 0.275, color: new THREE.Color(0xe8e4dc) },
    { progress: 0.425, color: new THREE.Color(0xe4e4df) },
    { progress: 0.625, color: new THREE.Color(0xe1e5e2) },
    { progress: 0.81, color: new THREE.Color(0xe7e3da) },
    { progress: 1, color: new THREE.Color(0xeadfce) },
  ];

  const updateAtmosphere = (currentProgress) => {
    let index = 0;
    while (
      index < backgroundStops.length - 2 &&
      currentProgress > backgroundStops[index + 1].progress
    ) {
      index += 1;
    }

    const before = backgroundStops[index];
    const after =
      backgroundStops[Math.min(backgroundStops.length - 1, index + 1)];
    const local = smootherStep(
      rangeProgress(currentProgress, before.progress, after.progress),
    );
    backgroundColor.lerpColors(before.color, after.color, local);
    fogColor.copy(backgroundColor).lerp(chalkColor, 0.14);
    scene.background.copy(backgroundColor);
    scene.fog.color.copy(fogColor);

    const intelligence = smootherStep(
      rangeProgress(currentProgress, 0.405, 0.625),
    );
    const verification = smootherStep(
      rangeProgress(currentProgress, 0.585, 0.81),
    );
    const accountability = smootherStep(
      rangeProgress(currentProgress, 0.79, 0.9),
    );

    intelligenceRim.intensity =
      1.1 + intelligence * 1.25 - accountability * 0.42;
    verifiedFill.intensity = verification * 1.3;
    boundaryLight.intensity =
      accountability * (quality === 'low' ? 12 : 21);
    renderer.toneMappingExposure =
      1.02 + intelligence * 0.035 + accountability * 0.025;
  };

  const setRendererQuality = (nextQuality, reason = 'adaptive') => {
    if (!QUALITY[nextQuality] || quality === nextQuality || disposed) {
      return;
    }

    quality = nextQuality;
    const config = QUALITY[quality];
    renderer.setPixelRatio(Math.min(pixelRatio, config.dpr));
    renderer.shadowMap.enabled = quality !== 'low';
    keyLight.castShadow = quality !== 'low';
    if (keyLight.shadow.map) {
      keyLight.shadow.map.dispose();
      keyLight.shadow.map = null;
    }
    keyLight.shadow.mapSize.set(config.shadowSize, config.shadowSize);
    materials.probability.transmission = quality === 'low' ? 0.22 : 0.68;
    materials.probability.opacity = quality === 'low' ? 0.38 : 0.56;
    materials.particle.size = quality === 'low' ? 0.085 : 0.065;
    evolution?.setQuality?.(config);
    notify('quality', {
      reason,
      dpr: Math.min(pixelRatio, config.dpr),
    });
    resize();
  };

  /**
   * The evolution module receives the authored camera and signal positions so
   * its probability cloud, molecular lineage, DNA, neural/calibration hinge,
   * proof loops, and founder boundary share the same spatial grammar. Narrative
   * time is progress; wall-clock time is only an optional restrained idle phase.
   */
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
    viewDirection.subVectors(lookTarget, cameraPosition).normalize();
    viewRight.crossVectors(viewDirection, camera.up).normalize();
    viewUp.crossVectors(viewRight, viewDirection).normalize();

    /**
     * Portrait composition is solved optically, not by masking the canvas. A
     * low-roll pull-back preserves the entire evolving object while moving its
     * visual center below the semantic copy. No radial or linear mask is
     * installed at any width.
     */
    const portraitComposition = smootherStep(
      clamp01((0.98 - viewportAspect) / 0.5),
    );
    camera.position.addScaledVector(
      viewDirection,
      -6.1 * portraitComposition,
    );
    lookTarget
      .addScaledVector(viewUp, 3.05 * portraitComposition)
      .addScaledVector(viewRight, 0.55 * portraitComposition);
    camera.fov =
      sampleTimedNumber(CAMERA_FOV, CAMERA_TIMES, progress) +
      portraitComposition * 14;
    camera.updateProjectionMatrix();
    camera.lookAt(lookTarget);

    cameraCurve.getTangentAt(cameraCurveProgress, tangent);
    const rollStrength = THREE.MathUtils.lerp(
      0.045,
      0.006,
      portraitComposition,
    );
    const rollLimit = THREE.MathUtils.lerp(
      0.06,
      0.008,
      portraitComposition,
    );
    camera.rotateZ(
      THREE.MathUtils.clamp(
        -tangent.x * rollStrength,
        -rollLimit,
        rollLimit,
      ),
    );

    coreAnchor.position.copy(corePosition);
    updateAtmosphere(progress);

    const stage = storyStageAt(progress);
    evolutionUpdateState.progress = progress;
    evolutionUpdateState.normalizedProgress = progress;
    evolutionUpdateState.stage = stage;
    evolutionUpdateState.storyStage = stage;
    evolutionUpdateState.time = reducedMotion ? 0 : timeSeconds;
    evolutionUpdateState.timeSeconds = reducedMotion ? 0 : timeSeconds;
    evolutionUpdateState.velocity = velocity;
    evolutionUpdateState.quality = quality;
    evolutionUpdateState.reducedMotion = reducedMotion;
    evolutionUpdateState.viewportAspect = viewportAspect;
    evolution?.update?.(evolutionUpdateState);
  };

  const renderFrame = (
    now =
      typeof performance === 'undefined' ? Date.now() : performance.now(),
  ) => {
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
      const measuredFps =
        (qualityWindowFrames * 1000) / qualityWindowDuration;
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
    if (
      disposed ||
      pauseReasons.size > 0 ||
      contextLost ||
      reducedMotion
    ) {
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
      Math.round(
        canvas.clientWidth ||
          (typeof window === 'undefined' ? 1 : window.innerWidth),
      ),
    );
    const height = Math.max(
      1,
      Math.round(
        canvas.clientHeight ||
          (typeof window === 'undefined' ? 1 : window.innerHeight),
      ),
    );

    renderer.setPixelRatio(
      Math.min(pixelRatio, QUALITY[quality].dpr),
    );
    renderer.setSize(width, height, false);
    viewportAspect = width / height;

    // Clear masks left by earlier deployments. The evolution is full-frame.
    canvas.style.removeProperty('mask-image');
    canvas.style.removeProperty('-webkit-mask-image');

    camera.aspect = viewportAspect;
    camera.updateProjectionMatrix();
    evolution?.resize?.({
      width,
      height,
      dpr: renderer.getPixelRatio(),
      aspect: viewportAspect,
      camera,
    });

    if (reducedMotion && pauseReasons.size === 0 && !contextLost) {
      renderFrame(
        lastFrameTime ||
          (typeof performance === 'undefined'
            ? Date.now()
            : performance.now()),
      );
    }
  }

  const onVisibilityChange = () => {
    if (document.hidden) {
      pauseReasons.add('visibility');
      stopLoop();
      evolution?.pause?.();
      notify('paused', { reason: 'visibility' });
    } else {
      pauseReasons.delete('visibility');
      evolution?.resume?.();
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
    evolution?.onContextLost?.();
    notify('context-lost');
  };

  const onContextRestored = () => {
    contextLost = false;
    pauseReasons.delete('context');
    evolution?.onContextRestored?.({
      renderer,
      quality,
    });
    evolution?.setQuality?.(QUALITY[quality]);
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
    beat: getBeatId(progress),
    storyStage: storyStageAt(progress),
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
      evolution?.pause?.();
      notify('paused', { reason: 'manual' });
    },

    resume() {
      if (disposed) {
        return;
      }
      pauseReasons.delete('manual');
      evolution?.resume?.();
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
      canvas.removeEventListener(
        'webglcontextrestored',
        onContextRestored,
        false,
      );
      canvas.style.removeProperty('mask-image');
      canvas.style.removeProperty('-webkit-mask-image');

      evolution?.dispose?.();

      const geometries = new Set();
      const disposableMaterials = new Set(Object.values(materials));
      scene.traverse((object) => {
        if (object.geometry) {
          geometries.add(object.geometry);
        }
        if (Array.isArray(object.material)) {
          object.material.forEach((material) =>
            disposableMaterials.add(material),
          );
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
      const persistentCore = getEvolutionCore(evolution, coreAnchor);
      if (typeof evolution?.getCoreWorldPosition === 'function') {
        evolution.getCoreWorldPosition(coreWorldPosition);
      } else if (persistentCore?.isObject3D) {
        persistentCore.getWorldPosition(coreWorldPosition);
      } else {
        coreAnchor.getWorldPosition(coreWorldPosition);
      }

      const beatId = getBeatId(progress);
      return {
        progress,
        beat: beatId,
        beatId,
        beatIndex: storyBeatIndexAt(progress),
        storyStage: storyStageAt(progress),
        cameraPosition: [
          Number(camera.position.x.toFixed(4)),
          Number(camera.position.y.toFixed(4)),
          Number(camera.position.z.toFixed(4)),
        ],
        core: {
          uuid: persistentCore?.uuid ?? coreAnchor.uuid,
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

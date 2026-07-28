import * as THREE from 'three';

import { storyStageAt } from './foundry-story.js';

const MAX_NODES = 192;
const MAX_LINKS = 240;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const QUALITY_LEVELS = Object.freeze({
  low: Object.freeze({ nodeCount: 72, linkCount: 84 }),
  balanced: Object.freeze({ nodeCount: 128, linkCount: 160 }),
  high: Object.freeze({ nodeCount: 192, linkCount: 240 }),
});

const STAGE_NAMES = Object.freeze([
  'entropy',
  'atoms',
  'dna',
  'intelligence',
  'autonomous-company',
  'founder-boundary',
]);

const TRANSITIONS = Object.freeze([
  Object.freeze({ from: 0, to: 1, start: 0.115, end: 0.165 }),
  Object.freeze({ from: 1, to: 2, start: 0.265, end: 0.315 }),
  Object.freeze({ from: 2, to: 3, start: 0.405, end: 0.465 }),
  Object.freeze({ from: 3, to: 4, start: 0.585, end: 0.645 }),
  Object.freeze({ from: 4, to: 5, start: 0.785, end: 0.845 }),
]);

const DEFAULT_PALETTE = Object.freeze({
  ivory: 0xe7e1d5,
  chalk: 0xf4efe5,
  graphite: 0x171613,
  titanium: 0x838782,
  violet: 0x7465ae,
  blue: 0x4d7f9d,
  teal: 0x2c9c9c,
  amber: 0xffa51f,
});

const clamp01 = (value) =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

const smoothstep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const range = (value, start, end) =>
  clamp01((value - start) / Math.max(0.00001, end - start));

const seeded = (index, salt = 0) => {
  const value = Math.sin(index * 91.173 + salt * 47.711) * 43758.5453123;
  return value - Math.floor(value);
};

const setTarget = (target, index, x, y, z) => {
  const offset = index * 3;
  target[offset] = x;
  target[offset + 1] = y;
  target[offset + 2] = z;
};

const getTarget = (target, index, output) => {
  const offset = index * 3;
  output.set(target[offset], target[offset + 1], target[offset + 2]);
  return output;
};

const buildStageTargets = () => {
  const targets = Array.from(
    { length: STAGE_NAMES.length },
    () => new Float32Array(MAX_NODES * 3),
  );

  const entropy = targets[0];
  for (let index = 0; index < MAX_NODES; index += 1) {
    const radius = 1.8 + seeded(index, 1) * 6.8;
    const theta = seeded(index, 2) * Math.PI * 2;
    const phi = Math.acos(2 * seeded(index, 3) - 1);
    setTarget(
      entropy,
      index,
      Math.sin(phi) * Math.cos(theta) * radius * 1.12,
      Math.cos(phi) * radius * 0.68,
      Math.sin(phi) * Math.sin(theta) * radius,
    );
  }

  const atoms = targets[1];
  const atomCenters = [
    [-2.75, -1.05, -0.35],
    [0.25, 0.8, 0.25],
    [3.1, -0.15, -0.15],
  ];
  for (let index = 0; index < MAX_NODES; index += 1) {
    const atom = index % atomCenters.length;
    const center = atomCenters[atom];
    const shell = index % 11 < 2 ? 0.35 : 1.45 + (index % 3) * 0.36;
    const theta = seeded(index, 11) * Math.PI * 2;
    const phi = Math.acos(2 * seeded(index, 12) - 1);
    const lobe = index % 2 === 0 ? 1 : -1;
    setTarget(
      atoms,
      index,
      center[0] + Math.sin(phi) * Math.cos(theta) * shell * 1.05,
      center[1] + Math.cos(phi) * shell * 1.16,
      center[2] + Math.sin(phi) * Math.sin(theta) * shell * 0.68 + lobe * 0.22,
    );
  }

  const dna = targets[2];
  const dnaPairs = MAX_NODES / 2;
  for (let index = 0; index < MAX_NODES; index += 1) {
    const pair = Math.floor(index / 2);
    const strand = index % 2;
    const progress = pair / Math.max(1, dnaPairs - 1);
    const theta = progress * Math.PI * 7.4 + strand * Math.PI;
    const radius = 2.15 + Math.sin(progress * Math.PI * 4) * 0.12;
    setTarget(
      dna,
      index,
      Math.cos(theta) * radius,
      (progress - 0.5) * 12.5,
      Math.sin(theta) * radius,
    );
  }

  const intelligence = targets[3];
  const columns = 16;
  for (let index = 0; index < MAX_NODES; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const nx = column / (columns - 1);
    const ny = row / 11;
    const residual =
      Math.sin(nx * Math.PI * 3.2) * 0.54 +
      Math.cos(ny * Math.PI * 2.6) * 0.36;
    setTarget(
      intelligence,
      index,
      (nx - 0.5) * 10.4,
      (ny - 0.5) * 8.2,
      residual + (column % 4 === 0 ? 0.32 : -0.08),
    );
  }

  const autonomous = targets[4];
  const loopSize = MAX_NODES / 3;
  const radii = [2.45, 4.15, 5.9];
  for (let index = 0; index < MAX_NODES; index += 1) {
    const loop = Math.min(2, Math.floor(index / loopSize));
    const within = index - loop * loopSize;
    const theta = (within / Math.max(1, loopSize - 1)) * Math.PI * 2;
    const radius = radii[loop];
    setTarget(
      autonomous,
      index,
      Math.cos(theta) * radius,
      Math.sin(theta) * radius * (0.76 - loop * 0.07),
      (loop - 1) * 1.4 + Math.sin(theta * 3) * 0.18,
    );
  }

  const boundary = targets[5];
  for (let index = 0; index < MAX_NODES; index += 1) {
    const ring = Math.floor(Math.sqrt(index));
    const angle = index * 2.399963229728653;
    const radius = Math.min(2.65, 0.18 + ring * 0.2);
    setTarget(
      boundary,
      index,
      Math.cos(angle) * radius * 0.78,
      Math.sin(angle) * radius,
      -0.05 - seeded(index, 31) * 0.55,
    );
  }

  return targets;
};

const createPairSet = () => ({
  pairs: new Uint16Array(MAX_LINKS * 2),
  count: 0,
});

const addPair = (set, from, to) => {
  if (set.count >= MAX_LINKS) {
    return;
  }
  const offset = set.count * 2;
  set.pairs[offset] = from % MAX_NODES;
  set.pairs[offset + 1] = to % MAX_NODES;
  set.count += 1;
};

const buildPairSets = () => {
  const structural = Array.from(
    { length: STAGE_NAMES.length },
    createPairSet,
  );
  const feedback = Array.from(
    { length: STAGE_NAMES.length },
    createPairSet,
  );

  for (let index = 0; index < 36; index += 1) {
    addPair(structural[0], index * 5, index * 5 + 1);
  }
  for (let index = 0; index < 18; index += 1) {
    addPair(feedback[0], index * 9, index * 9 + 7);
  }

  for (let index = 0; index < MAX_NODES; index += 1) {
    const atom = index % 3;
    const next = (index + 3) % MAX_NODES;
    if (next % 3 === atom) {
      addPair(structural[1], index, next);
    }
    if (index < 72) {
      addPair(feedback[1], index, (index + 64) % MAX_NODES);
    }
  }

  const dnaPairs = MAX_NODES / 2;
  for (let pair = 0; pair < dnaPairs; pair += 1) {
    const left = pair * 2;
    const right = left + 1;
    addPair(feedback[2], left, right);
    if (pair < dnaPairs - 1) {
      addPair(structural[2], left, left + 2);
      addPair(structural[2], right, right + 2);
    }
  }

  const columns = 16;
  const rows = MAX_NODES / columns;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      if (column < columns - 1) {
        addPair(structural[3], index, index + 1);
      }
      if (row < rows - 1) {
        addPair(structural[3], index, index + columns);
      }
      if (column % 4 === 0 && row < rows - 2) {
        addPair(feedback[3], index, index + columns * 2);
      }
    }
  }

  const loopSize = MAX_NODES / 3;
  for (let loop = 0; loop < 3; loop += 1) {
    for (let within = 0; within < loopSize; within += 1) {
      const index = loop * loopSize + within;
      const next = loop * loopSize + ((within + 1) % loopSize);
      addPair(structural[4], index, next);
      if (within % 5 === 0) {
        addPair(
          feedback[4],
          index,
          ((loop + 1) % 3) * loopSize + within,
        );
      }
    }
  }

  for (let index = 1; index < 128; index += 1) {
    addPair(structural[5], index, Math.floor((index - 1) / 2));
  }
  for (let index = 0; index < 48; index += 1) {
    addPair(feedback[5], index, (index * 7 + 19) % 96);
  }

  return { structural, feedback };
};

const resolveMorph = (progress, output) => {
  const normalized = clamp01(progress);

  for (let index = 0; index < TRANSITIONS.length; index += 1) {
    const transition = TRANSITIONS[index];
    if (normalized < transition.start) {
      output.from = transition.from;
      output.to = transition.from;
      output.mix = 0;
      return output;
    }
    if (normalized <= transition.end) {
      output.from = transition.from;
      output.to = transition.to;
      output.mix = smoothstep(
        range(normalized, transition.start, transition.end),
      );
      return output;
    }
  }

  output.from = STAGE_NAMES.length - 1;
  output.to = STAGE_NAMES.length - 1;
  output.mix = 0;
  return output;
};

const createHelixCurve = (phase) => {
  const points = [];
  for (let index = 0; index <= 96; index += 1) {
    const progress = index / 96;
    const theta = progress * Math.PI * 7.4 + phase;
    points.push(
      new THREE.Vector3(
        Math.cos(theta) * 2.15,
        (progress - 0.5) * 12.5,
        Math.sin(theta) * 2.15,
      ),
    );
  }
  return new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.45);
};

const createCalibrationGrid = () => {
  const positions = [];
  const width = 10.4;
  const height = 8.2;
  const columns = 10;
  const rows = 8;

  for (let column = 0; column <= columns; column += 1) {
    const x = -width / 2 + (column / columns) * width;
    positions.push(x, -height / 2, 0, x, height / 2, 0);
  }
  for (let row = 0; row <= rows; row += 1) {
    const y = -height / 2 + (row / rows) * height;
    positions.push(-width / 2, y, 0, width / 2, y, 0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return geometry;
};

const createResidualGeometry = () => {
  const positions = [];
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const x = -4.6 + column * 1.32;
      const y = -3.2 + row * 1.28;
      const predicted =
        Math.sin(column * 0.72) * 0.42 + Math.cos(row * 0.61) * 0.28;
      const measured = predicted + ((row + column) % 3 - 1) * 0.38;
      positions.push(x, y, predicted, x, y, measured);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return geometry;
};

const createPhaseCurve = () =>
  new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-0.92, -0.08, -0.14),
      new THREE.Vector3(-0.58, 0.18, 0.02),
      new THREE.Vector3(-0.2, 0.26, 0.12),
      new THREE.Vector3(0.18, 0.04, 0.08),
      new THREE.Vector3(0.56, -0.16, -0.04),
      new THREE.Vector3(0.9, 0.08, -0.16),
    ],
    false,
    'centripetal',
    0.42,
  );

const resolveQuality = (quality) => {
  if (typeof quality === 'string' && QUALITY_LEVELS[quality]) {
    return QUALITY_LEVELS[quality];
  }
  if (
    quality &&
    Number.isFinite(quality.nodeCount) &&
    Number.isFinite(quality.linkCount)
  ) {
    return {
      nodeCount: Math.min(MAX_NODES, Math.max(24, quality.nodeCount)),
      linkCount: Math.min(MAX_LINKS, Math.max(24, quality.linkCount)),
    };
  }
  return QUALITY_LEVELS.balanced;
};

const setMaterialOpacity = (material, opacity) => {
  material.opacity = clamp01(opacity);
  material.visible = material.opacity > 0.003;
};

export function createEvolutionSystem({
  materials = {},
  qualityConfig,
  quality = 'balanced',
  persistentCore,
  core,
  parent,
  world,
  palette = DEFAULT_PALETTE,
} = {}) {
  const colors = { ...DEFAULT_PALETTE, ...palette };
  const group = new THREE.Group();
  group.name = 'evolutionary-continuum';

  const host = parent ?? world;
  if (host?.isObject3D) {
    host.add(group);
  }

  const signal = persistentCore ?? core ?? new THREE.Object3D();
  signal.name ||= 'persistent-evolution-signal';
  if (!signal.parent && host?.isObject3D) {
    host.add(signal);
  }

  const targets = buildStageTargets();
  const pairSets = buildPairSets();
  const currentPositions = new Float32Array(MAX_NODES * 3);
  const morph = { from: 0, to: 0, mix: 0 };
  const stageWeights = new Float32Array(STAGE_NAMES.length);
  let activeQuality = resolveQuality(qualityConfig ?? quality);
  let disposed = false;

  const stageColors = [
    new THREE.Color(colors.violet),
    new THREE.Color(colors.blue),
    new THREE.Color(0x477f99),
    new THREE.Color(colors.teal),
    new THREE.Color(0x6f756f),
    new THREE.Color(colors.amber),
  ];
  const mixedColor = new THREE.Color();
  const titaniumColor = new THREE.Color(colors.titanium);
  const amberColor = new THREE.Color(colors.amber);

  const authoredNodeMaterial =
    materials.nodes ??
    new THREE.MeshPhysicalMaterial({
      color: colors.violet,
      roughness: 0.32,
      metalness: 0.12,
      clearcoat: 0.38,
      clearcoatRoughness: 0.34,
      emissive: colors.violet,
      emissiveIntensity: 0.055,
    });
  const nodeGeometry = new THREE.IcosahedronGeometry(0.16, 1);
  const nodes = new THREE.InstancedMesh(
    nodeGeometry,
    authoredNodeMaterial,
    MAX_NODES,
  );
  nodes.name = 'seeded-material-population';
  nodes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  nodes.castShadow = true;
  nodes.receiveShadow = true;
  group.add(nodes);

  const structuralMaterial =
    materials.structuralLinks ??
    new THREE.MeshPhysicalMaterial({
      color: colors.titanium,
      roughness: 0.42,
      metalness: 0.32,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
    });
  const feedbackMaterial =
    materials.feedbackLinks ??
    new THREE.MeshPhysicalMaterial({
      color: colors.teal,
      emissive: colors.teal,
      emissiveIntensity: 0.08,
      roughness: 0.3,
      metalness: 0.18,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
  const linkGeometry = new THREE.CylinderGeometry(0.025, 0.025, 1, 6, 1);
  const structuralLinks = new THREE.InstancedMesh(
    linkGeometry,
    structuralMaterial,
    MAX_LINKS,
  );
  const feedbackLinks = new THREE.InstancedMesh(
    linkGeometry,
    feedbackMaterial,
    MAX_LINKS,
  );
  structuralLinks.name = 'morphing-structure-link-pool';
  feedbackLinks.name = 'morphing-feedback-link-pool';
  structuralLinks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  feedbackLinks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(structuralLinks, feedbackLinks);

  const probabilityMaterial =
    materials.probability ??
    new THREE.MeshPhysicalMaterial({
      color: colors.blue,
      roughness: 0.16,
      metalness: 0,
      transmission: 0.42,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const probabilityShells = new THREE.Group();
  probabilityShells.name = 'atomic-probability-density';
  const probabilityGeometry = new THREE.SphereGeometry(1, 28, 18);
  const shellTransforms = [
    [-2.75, -1.05, -0.35, 2.4, 2.45, 1.25],
    [0.25, 0.8, 0.25, 2.1, 2.3, 1.35],
    [3.1, -0.15, -0.15, 2.35, 2.2, 1.2],
  ];
  for (const [x, y, z, sx, sy, sz] of shellTransforms) {
    const shell = new THREE.Mesh(probabilityGeometry, probabilityMaterial);
    shell.position.set(x, y, z);
    shell.scale.set(sx, sy, sz);
    probabilityShells.add(shell);
  }
  group.add(probabilityShells);

  const dnaMaterial =
    materials.dna ??
    new THREE.MeshPhysicalMaterial({
      color: colors.chalk,
      roughness: 0.42,
      metalness: 0.04,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  const dnaAccentMaterial =
    materials.dnaAccent ??
    new THREE.MeshPhysicalMaterial({
      color: colors.blue,
      roughness: 0.32,
      metalness: 0.08,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  const dnaGroup = new THREE.Group();
  dnaGroup.name = 'inherited-information-groove';
  const helixA = new THREE.Mesh(
    new THREE.TubeGeometry(createHelixCurve(0), 144, 0.075, 7, false),
    dnaMaterial,
  );
  const helixB = new THREE.Mesh(
    new THREE.TubeGeometry(createHelixCurve(Math.PI), 144, 0.075, 7, false),
    dnaAccentMaterial,
  );
  dnaGroup.add(helixA, helixB);
  group.add(dnaGroup);

  const calibrationGroup = new THREE.Group();
  calibrationGroup.name = 'engineered-calibration-plane';
  const calibrationMaterial =
    materials.calibration ??
    new THREE.LineBasicMaterial({
      color: colors.graphite,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  const residualMaterial =
    materials.residual ??
    new THREE.LineBasicMaterial({
      color: colors.teal,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  const calibrationGrid = new THREE.LineSegments(
    createCalibrationGrid(),
    calibrationMaterial,
  );
  calibrationGrid.position.z = 0.35;
  const residuals = new THREE.LineSegments(
    createResidualGeometry(),
    residualMaterial,
  );
  residuals.position.z = 0.38;
  calibrationGroup.add(calibrationGrid, residuals);
  group.add(calibrationGroup);

  const proofLoopMaterials = [0, 1, 2].map(
    (index) =>
      materials[`proofLoop${index}`] ??
      new THREE.MeshPhysicalMaterial({
        color: index === 2 ? colors.blue : colors.teal,
        roughness: 0.29,
        metalness: 0.18,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        emissive: index === 2 ? colors.blue : colors.teal,
        emissiveIntensity: 0.045,
      }),
  );
  const proofLoops = new THREE.Group();
  proofLoops.name = 'company-cro-lab-proof-loops';
  const loopRadii = [2.45, 4.15, 5.9];
  const proofPulses = [];
  for (let index = 0; index < 3; index += 1) {
    const loop = new THREE.Mesh(
      new THREE.TorusGeometry(loopRadii[index], 0.07, 8, 96),
      proofLoopMaterials[index],
    );
    loop.scale.y = 0.76 - index * 0.07;
    loop.position.z = (index - 1) * 1.4;
    proofLoops.add(loop);

    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.16 + index * 0.02, 14, 10),
      proofLoopMaterials[index],
    );
    pulse.name = `verified-proof-pulse-${index + 1}`;
    proofLoops.add(pulse);
    proofPulses.push(pulse);
  }
  group.add(proofLoops);

  const boundaryGroup = new THREE.Group();
  boundaryGroup.name = 'founder-boundary-membrane';
  const boundaryMaterial =
    materials.boundary ??
    new THREE.MeshPhysicalMaterial({
      color: colors.titanium,
      roughness: 0.72,
      metalness: 0.03,
      transparent: true,
      opacity: 0.012,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const boundaryPlaneGeometry = new THREE.PlaneGeometry(14, 11, 18, 14);
  const boundaryPlane = new THREE.Mesh(
    boundaryPlaneGeometry,
    boundaryMaterial,
  );
  boundaryPlane.position.z = -2.45;
  const boundaryEdgeMaterial =
    materials.boundaryEdge ??
    new THREE.LineBasicMaterial({
      color: colors.amber,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  const boundaryEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(boundaryPlaneGeometry, 26),
    boundaryEdgeMaterial,
  );
  boundaryEdges.position.copy(boundaryPlane.position);
  boundaryGroup.add(boundaryPlane, boundaryEdges);
  group.add(boundaryGroup);

  const phaseMaterial =
    materials.phase ??
    new THREE.MeshPhysicalMaterial({
      color: colors.violet,
      emissive: colors.violet,
      emissiveIntensity: 0.18,
      roughness: 0.2,
      metalness: 0.08,
      clearcoat: 0.62,
      clearcoatRoughness: 0.18,
    });
  const phaseTrace = new THREE.Group();
  phaseTrace.name = 'persistent-phase-trace';
  const phasePearl = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.38, 2),
    phaseMaterial,
  );
  const phaseFilament = new THREE.Mesh(
    new THREE.TubeGeometry(createPhaseCurve(), 52, 0.025, 7, false),
    phaseMaterial,
  );
  phaseFilament.position.x = -0.24;
  phaseFilament.rotation.x = -0.34;
  phaseTrace.add(phasePearl, phaseFilament);
  signal.add(phaseTrace);

  const dummy = new THREE.Object3D();
  const linkStart = new THREE.Vector3();
  const linkEnd = new THREE.Vector3();
  const linkMid = new THREE.Vector3();
  const linkDirection = new THREE.Vector3();
  const pulsePosition = new THREE.Vector3();

  const writeCurrentPositions = () => {
    const from = targets[morph.from];
    const to = targets[morph.to];
    const mix = morph.mix;
    const inverse = 1 - mix;
    const count = activeQuality.nodeCount;
    const stageScale =
      0.84 +
      (morph.from === 0 ? 0.18 * (1 - mix) : 0) +
      (morph.to === 5 ? 0.2 * mix : 0);

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const x = from[offset] * inverse + to[offset] * mix;
      const y = from[offset + 1] * inverse + to[offset + 1] * mix;
      const z = from[offset + 2] * inverse + to[offset + 2] * mix;
      currentPositions[offset] = x;
      currentPositions[offset + 1] = y;
      currentPositions[offset + 2] = z;

      dummy.position.set(x, y, z);
      const variation = 0.72 + seeded(index, 42) * 0.64;
      dummy.scale.setScalar(stageScale * variation);
      dummy.rotation.set(
        seeded(index, 51) * Math.PI,
        seeded(index, 52) * Math.PI,
        seeded(index, 53) * Math.PI,
      );
      dummy.updateMatrix();
      nodes.setMatrixAt(index, dummy.matrix);
    }

    nodes.count = count;
    nodes.instanceMatrix.needsUpdate = true;
  };

  const updateLinkPool = (mesh, set, opacity, radiusScale = 1) => {
    const pairCount = Math.min(
      activeQuality.linkCount,
      set.count,
    );
    const nodeCount = activeQuality.nodeCount;
    let visibleCount = 0;

    for (let index = 0; index < pairCount; index += 1) {
      const pairOffset = index * 2;
      const fromIndex = set.pairs[pairOffset] % nodeCount;
      const toIndex = set.pairs[pairOffset + 1] % nodeCount;
      getTarget(currentPositions, fromIndex, linkStart);
      getTarget(currentPositions, toIndex, linkEnd);
      linkDirection.subVectors(linkEnd, linkStart);
      const length = linkDirection.length();
      if (length < 0.06) {
        continue;
      }

      linkMid.addVectors(linkStart, linkEnd).multiplyScalar(0.5);
      dummy.position.copy(linkMid);
      dummy.quaternion.setFromUnitVectors(
        Y_AXIS,
        linkDirection.multiplyScalar(1 / length),
      );
      dummy.scale.set(radiusScale, length, radiusScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(visibleCount, dummy.matrix);
      visibleCount += 1;
    }

    mesh.count = visibleCount;
    mesh.material.opacity = clamp01(opacity);
    mesh.visible = visibleCount > 0 && opacity > 0.003;
    mesh.instanceMatrix.needsUpdate = true;
  };

  const updateStageWeights = () => {
    stageWeights.fill(0);
    if (morph.from === morph.to) {
      stageWeights[morph.from] = 1;
      return;
    }
    stageWeights[morph.from] = 1 - morph.mix;
    stageWeights[morph.to] = morph.mix;
  };

  const setQuality = (nextQuality) => {
    activeQuality = resolveQuality(nextQuality);
    nodes.count = activeQuality.nodeCount;
    structuralLinks.count = Math.min(
      activeQuality.linkCount,
      structuralLinks.count,
    );
    feedbackLinks.count = Math.min(
      activeQuality.linkCount,
      feedbackLinks.count,
    );
  };

  const update = ({
    progress = 0,
    corePosition,
    reducedMotion = false,
  } = {}) => {
    if (disposed) {
      return;
    }

    const normalized = clamp01(progress);
    resolveMorph(normalized, morph);
    updateStageWeights();

    if (corePosition?.isVector3) {
      group.position.copy(corePosition);
    }

    writeCurrentPositions();

    mixedColor.lerpColors(
      stageColors[morph.from],
      stageColors[morph.to],
      morph.mix,
    );
    authoredNodeMaterial.color.copy(mixedColor);
    authoredNodeMaterial.emissive.copy(mixedColor);
    authoredNodeMaterial.emissiveIntensity =
      0.035 + stageWeights[3] * 0.05 + stageWeights[4] * 0.07;

    structuralMaterial.color
      .copy(titaniumColor)
      .lerp(mixedColor, 0.2 + stageWeights[4] * 0.2);
    feedbackMaterial.color.copy(mixedColor);
    feedbackMaterial.emissive.copy(mixedColor);

    if (morph.from === morph.to) {
      updateLinkPool(
        structuralLinks,
        pairSets.structural[morph.from],
        morph.from === 0 ? 0.12 : morph.from === 1 ? 0.22 : 0.44,
      );
      updateLinkPool(
        feedbackLinks,
        pairSets.feedback[morph.from],
        morph.from === 1 ? 0.08 : morph.from >= 3 ? 0.3 : 0.17,
        0.88,
      );
    } else {
      const bridge = Math.sin(morph.mix * Math.PI);
      updateLinkPool(
        structuralLinks,
        pairSets.structural[morph.from],
        (1 - morph.mix) * 0.42 + bridge * 0.08,
      );
      updateLinkPool(
        feedbackLinks,
        pairSets.structural[morph.to],
        morph.mix * 0.42 + bridge * 0.08,
        0.88,
      );
    }

    const atomPresence = stageWeights[1];
    setMaterialOpacity(probabilityMaterial, atomPresence * 0.2);
    probabilityShells.scale.setScalar(0.86 + atomPresence * 0.14);
    probabilityShells.rotation.y = normalized * 0.28;

    const dnaPresence = stageWeights[2];
    setMaterialOpacity(dnaMaterial, dnaPresence * 0.78);
    setMaterialOpacity(dnaAccentMaterial, dnaPresence * 0.64);
    dnaGroup.rotation.y = -0.22 + normalized * 0.36;

    const intelligencePresence = stageWeights[3];
    calibrationMaterial.opacity = intelligencePresence * 0.34;
    residualMaterial.opacity = intelligencePresence * 0.72;
    calibrationGrid.visible = calibrationMaterial.opacity > 0.003;
    residuals.visible = residualMaterial.opacity > 0.003;
    calibrationGroup.rotation.y = -0.12 + normalized * 0.18;

    const proofPresence = stageWeights[4];
    for (let index = 0; index < proofLoopMaterials.length; index += 1) {
      const material = proofLoopMaterials[index];
      setMaterialOpacity(
        material,
        proofPresence * (0.66 - index * 0.08),
      );
      const theta =
        range(normalized, 0.625, 0.81) * Math.PI * 2 * (1.1 - index * 0.16) +
        index * 1.3;
      pulsePosition.set(
        Math.cos(theta) * loopRadii[index],
        Math.sin(theta) * loopRadii[index] * (0.76 - index * 0.07),
        (index - 1) * 1.4,
      );
      proofPulses[index].position.copy(pulsePosition);
    }

    const accountability = smoothstep(range(normalized, 0.81, 0.91));
    boundaryMaterial.color
      .copy(titaniumColor)
      .lerp(amberColor, accountability);
    boundaryMaterial.opacity = 0.012 + accountability * 0.25;
    boundaryEdgeMaterial.opacity = accountability * 0.5;
    boundaryPlane.visible = boundaryMaterial.opacity > 0.003;
    boundaryEdges.visible = boundaryEdgeMaterial.opacity > 0.003;

    phaseMaterial.color
      .copy(mixedColor)
      .lerp(amberColor, accountability);
    phaseMaterial.emissive.copy(phaseMaterial.color);
    phaseMaterial.emissiveIntensity =
      0.12 + stageWeights[4] * 0.1 + accountability * 0.18;
    phaseFilament.rotation.z = -0.18 + normalized * Math.PI * 0.72;
    phaseFilament.rotation.y = normalized * Math.PI * 0.34;
    const signalScale =
      0.82 +
      stageWeights[2] * 0.12 +
      stageWeights[3] * 0.18 +
      accountability * 0.24;
    phaseTrace.scale.setScalar(signalScale);

    if (reducedMotion) {
      phaseFilament.rotation.z = -0.18 + normalized * Math.PI * 0.36;
    }
  };

  setQuality(qualityConfig ?? quality);
  update({ progress: 0, corePosition: signal.position, reducedMotion: true });

  return {
    group,
    root: group,
    core: signal,
    persistentCore: signal,
    stageAt: storyStageAt,
    update,
    setQuality,
    resize() {},
    pause() {},
    resume() {},
    onContextLost() {},
    onContextRestored() {},
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      group.removeFromParent();
      phaseTrace.removeFromParent();

      const geometries = new Set();
      const ownedMaterials = new Set();
      group.traverse((object) => {
        if (object.geometry) {
          geometries.add(object.geometry);
        }
        if (object.material) {
          const objectMaterials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of objectMaterials) {
            ownedMaterials.add(material);
          }
        }
      });
      phaseTrace.traverse((object) => {
        if (object.geometry) {
          geometries.add(object.geometry);
        }
        if (object.material) {
          ownedMaterials.add(object.material);
        }
      });

      geometries.forEach((geometry) => geometry.dispose());
      ownedMaterials.forEach((material) => {
        if (!Object.values(materials).includes(material)) {
          material.dispose();
        }
      });
    },
  };
}

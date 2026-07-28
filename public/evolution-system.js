import * as THREE from 'three';

import { storyStageAt } from './foundry-story.js';

const MAX_NODES = 192;
const MAX_LINKS = 240;
const DENSITY_COUNT = 6000;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const HUMAN_CHEST_Y = 0.62;
const HUMAN_CHEST_Z = 0.42;
const HUMAN_WITNESS_REGIONS = Object.freeze([
  'head',
  'torso',
  'left-arm',
  'right-arm',
  'left-leg',
  'right-leg',
  'shoulder',
  'pelvis',
  'head',
  'torso',
  'left-leg',
  'right-leg',
  'neck',
]);

const QUALITY_LEVELS = Object.freeze({
  low: Object.freeze({
    nodeCount: 72,
    linkCount: 84,
    densityCount: 2400,
  }),
  balanced: Object.freeze({
    nodeCount: 128,
    linkCount: 160,
    densityCount: 4200,
  }),
  high: Object.freeze({
    nodeCount: 192,
    linkCount: 240,
    densityCount: 6000,
  }),
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
  Object.freeze({ from: 4, to: 5, start: 0.742, end: 0.802 }),
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

const humanSampleProgress = (ordinal) =>
  (0.5 + ordinal * 0.618033988749895) % 1;

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

  const humanWitness = targets[5];
  /*
   * The final target is an embodied human witness: head, shoulder, torso,
   * relaxed arm, pelvis, and separated leg regions are interleaved so even
   * the 72-node quality tier preserves the complete silhouette.
   */
  const humanRegionSequence = HUMAN_WITNESS_REGIONS;
  const humanRegionTotals = new Map();
  const humanRegionOrdinals = new Map();
  for (let index = 0; index < MAX_NODES; index += 1) {
    const region = humanRegionSequence[index % humanRegionSequence.length];
    humanRegionTotals.set(region, (humanRegionTotals.get(region) ?? 0) + 1);
  }

  for (let index = 0; index < MAX_NODES; index += 1) {
    const region = humanRegionSequence[index % humanRegionSequence.length];
    const ordinal = humanRegionOrdinals.get(region) ?? 0;
    humanRegionOrdinals.set(region, ordinal + 1);
    const total = humanRegionTotals.get(region) ?? 1;
    const progress = humanSampleProgress(ordinal);
    const spiral = ordinal * 2.399963229728653;
    let x = 0;
    let y = 0;
    let z = 0;

    if (region === 'head') {
      const vertical = 1 - progress * 2;
      const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical));
      const headAngle = seeded(index, 63) * Math.PI * 2;
      x = Math.cos(headAngle) * radial * 0.92;
      y = 3.22 + vertical * 1.08;
      z = Math.sin(headAngle) * radial * 0.62;
    } else if (region === 'neck') {
      const side = ordinal % 2 === 0 ? -1 : 1;
      const row = Math.floor(ordinal / 2);
      const rows = Math.ceil(total / 2);
      x = side * (0.3 + seeded(index, 61) * 0.08);
      y = 1.83 + ((row + 0.5) / rows) * 0.52;
      z = (seeded(index, 62) - 0.5) * 0.42;
    } else if (region === 'shoulder') {
      x = (progress - 0.5) * 3.18;
      y =
        1.82 -
        Math.abs(x) * 0.09 +
        (x < 0 ? -0.07 : 0.03);
      z = Math.sin(spiral) * 0.38;
    } else if (region === 'torso') {
      const vertical = progress;
      const halfWidth =
        vertical < 0.7
          ? 1.5 - vertical * 0.92
          : 0.86 + (vertical - 0.7) * 0.68;
      x = Math.cos(spiral) * halfWidth;
      y = 1.72 - vertical * 2.78;
      z = Math.sin(spiral) * 0.54;
    } else if (region === 'pelvis') {
      const angle = progress * Math.PI * 2;
      x = Math.cos(angle) * 1.08;
      y = -1.18 + Math.sin(angle) * 0.62;
      z = Math.sin(spiral) * 0.42;
    } else {
      const side = region.startsWith('left') ? -1 : 1;
      const radialX = Math.cos(spiral);
      const radialZ = Math.sin(spiral);

      if (region.endsWith('arm')) {
        const bend = Math.sin(progress * Math.PI);
        const radius = 0.3 - progress * 0.11;
        x =
          side * (1.46 + progress * 0.88 + bend * 0.18) +
          radialX * radius;
        y =
          1.54 -
          progress * 2.84 +
          radialX * radius * 0.18 +
          (side < 0 ? -0.1 : 0.04 * bend);
        z = radialZ * radius;
      } else {
        const bend = Math.sin(progress * Math.PI);
        const radius = 0.4 - progress * 0.16;
        x =
          side * (0.62 + progress * 0.35 + bend * 0.1) +
          radialX * radius;
        y = -1.42 - progress * 3.72;
        z = radialZ * radius * 0.88;
      }
    }

    setTarget(
      humanWitness,
      index,
      x,
      y,
      z,
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

const sortPairsByMaximumIndex = (set) => {
  const ordered = Array.from({ length: set.count }, (_, index) => {
    const offset = index * 2;
    return [set.pairs[offset], set.pairs[offset + 1]];
  }).sort(
    (left, right) =>
      Math.max(left[0], left[1]) - Math.max(right[0], right[1]),
  );

  for (let index = 0; index < ordered.length; index += 1) {
    const offset = index * 2;
    set.pairs[offset] = ordered[index][0];
    set.pairs[offset + 1] = ordered[index][1];
  }
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

  const witnessNodesByRegion = new Map();
  for (let index = 0; index < MAX_NODES; index += 1) {
    const region =
      HUMAN_WITNESS_REGIONS[index % HUMAN_WITNESS_REGIONS.length];
    const regionNodes = witnessNodesByRegion.get(region) ?? [];
    regionNodes.push(index);
    witnessNodesByRegion.set(region, regionNodes);
  }

  const addRegionBridges = (
    set,
    fromRegion,
    toRegion,
    stride = 3,
  ) => {
    const fromNodes = witnessNodesByRegion.get(fromRegion) ?? [];
    const toNodes = witnessNodesByRegion.get(toRegion) ?? [];
    const count = Math.min(fromNodes.length, toNodes.length);
    for (let index = 0; index < count; index += stride) {
      addPair(set, fromNodes[index], toNodes[index]);
    }
  };

  /*
   * Anatomical bridges are written first so the 84-link low tier always keeps
   * the complete head-to-feet chain before secondary surface connections.
   */
  addRegionBridges(structural[5], 'head', 'neck', 100);
  addRegionBridges(structural[5], 'neck', 'shoulder', 6);
  addRegionBridges(structural[5], 'shoulder', 'torso', 6);
  addRegionBridges(structural[5], 'shoulder', 'left-arm', 6);
  addRegionBridges(structural[5], 'shoulder', 'right-arm', 6);
  addRegionBridges(structural[5], 'torso', 'pelvis', 6);
  addRegionBridges(structural[5], 'pelvis', 'left-leg', 6);
  addRegionBridges(structural[5], 'pelvis', 'right-leg', 6);

  const chainedPairs = new Set();
  for (const tierLimit of [72, 128, MAX_NODES]) {
    for (const [region, regionNodes] of witnessNodesByRegion.entries()) {
      if (region === 'head') {
        continue;
      }
      const orderedNodes = regionNodes
        .map((node, ordinal) => ({
          node,
          progress: humanSampleProgress(ordinal),
        }))
        .filter(({ node }) => node < tierLimit)
        .sort((left, right) => left.progress - right.progress);
      for (let index = 1; index < orderedNodes.length; index += 1) {
        const from = orderedNodes[index - 1].node;
        const to = orderedNodes[index].node;
        const key = `${Math.min(from, to)}:${Math.max(from, to)}`;
        if (chainedPairs.has(key)) {
          continue;
        }
        chainedPairs.add(key);
        addPair(structural[5], from, to);
      }
    }
  }

  addRegionBridges(feedback[5], 'shoulder', 'torso', 4);
  addRegionBridges(feedback[5], 'torso', 'pelvis', 4);
  addRegionBridges(feedback[5], 'pelvis', 'left-leg', 5);
  addRegionBridges(feedback[5], 'pelvis', 'right-leg', 5);

  const torsoNodes = witnessNodesByRegion.get('torso') ?? [];
  for (let index = 2; index < torsoNodes.length; index += 4) {
    addPair(feedback[5], torsoNodes[0], torsoNodes[index]);
  }
  sortPairsByMaximumIndex(structural[5]);
  sortPairsByMaximumIndex(feedback[5]);

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

const createEllipseGeometry = (radiusX, radiusY, segments = 128) => {
  const positions = new Float32Array(segments * 3);
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const offset = index * 3;
    positions[offset] = Math.cos(angle) * radiusX;
    positions[offset + 1] = Math.sin(angle) * radiusY;
    positions[offset + 2] = 0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3),
  );
  return geometry;
};

const createContinuumPointTexture = () => {
  const size = 32;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = ((y + 0.5) / size) * 2 - 1;
      const radius = Math.hypot(nx, ny);
      const edge = smoothstep(range(1 - radius, 0, 0.22));
      const highlight = clamp01(
        1 - Math.hypot(nx + 0.28, ny - 0.3) / 0.86,
      );
      const offset = (y * size + x) * 4;
      const luminance = Math.round(210 + highlight * 45);
      data[offset] = luminance;
      data[offset + 1] = luminance;
      data[offset + 2] = luminance;
      data[offset + 3] = Math.round(edge * 255);
    }
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
  );
  texture.name = 'continuum-particle-lens';
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
};

const createHumanWitnessShape = () => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 4.3);
  shape.bezierCurveTo(0.58, 4.3, 0.94, 3.86, 0.94, 3.27);
  shape.bezierCurveTo(0.94, 2.76, 0.7, 2.39, 0.43, 2.22);
  shape.bezierCurveTo(0.78, 2.08, 1.29, 1.9, 1.58, 1.7);
  shape.bezierCurveTo(1.94, 1.41, 2.17, 0.65, 2.34, -0.02);
  shape.bezierCurveTo(2.48, -0.56, 2.66, -1.18, 2.55, -1.42);
  shape.bezierCurveTo(2.47, -1.61, 2.2, -1.61, 2.08, -1.4);
  shape.bezierCurveTo(1.91, -1.03, 1.73, -0.31, 1.47, 0.37);
  shape.bezierCurveTo(1.36, 0.14, 1.24, -0.48, 1.08, -1.12);
  shape.bezierCurveTo(1.28, -1.4, 1.31, -2.43, 1.28, -3.48);
  shape.bezierCurveTo(1.27, -4.12, 1.35, -4.73, 1.41, -5.03);
  shape.bezierCurveTo(1.45, -5.26, 0.73, -5.3, 0.66, -5.04);
  shape.bezierCurveTo(0.53, -4.32, 0.49, -2.82, 0.4, -1.82);
  shape.bezierCurveTo(0.29, -1.68, 0.15, -1.61, 0, -1.61);
  shape.bezierCurveTo(-0.16, -1.61, -0.3, -1.69, -0.41, -1.83);
  shape.bezierCurveTo(-0.5, -2.82, -0.56, -4.3, -0.67, -5.04);
  shape.bezierCurveTo(-0.72, -5.3, -1.47, -5.28, -1.42, -5.02);
  shape.bezierCurveTo(-1.35, -4.67, -1.3, -4.08, -1.29, -3.47);
  shape.bezierCurveTo(-1.27, -2.42, -1.29, -1.4, -1.09, -1.11);
  shape.bezierCurveTo(-1.25, -0.47, -1.37, 0.13, -1.48, 0.35);
  shape.bezierCurveTo(-1.77, -0.33, -1.96, -1.05, -2.12, -1.42);
  shape.bezierCurveTo(-2.24, -1.63, -2.52, -1.62, -2.59, -1.4);
  shape.bezierCurveTo(-2.69, -1.14, -2.49, -0.54, -2.36, -0.01);
  shape.bezierCurveTo(-2.18, 0.65, -1.95, 1.35, -1.61, 1.64);
  shape.bezierCurveTo(-1.3, 1.9, -0.78, 2.08, -0.43, 2.22);
  shape.bezierCurveTo(-0.71, 2.4, -0.95, 2.77, -0.95, 3.28);
  shape.bezierCurveTo(-0.95, 3.87, -0.58, 4.3, 0, 4.3);
  shape.closePath();
  return shape;
};

const buildContinuumDensityTargets = (nodeTargets) => {
  const densityTargets = Array.from(
    { length: STAGE_NAMES.length },
    () => new Float32Array(DENSITY_COUNT * 3),
  );
  const stageSpread = [0.58, 0.22, 0.13, 0.18, 0.16];

  for (let stage = 0; stage < STAGE_NAMES.length - 1; stage += 1) {
    const nodeTarget = nodeTargets[stage];
    const densityTarget = densityTargets[stage];
    const spread = stageSpread[stage];
    for (let index = 0; index < DENSITY_COUNT; index += 1) {
      const anchor = (index * 73 + Math.floor(index / MAX_NODES) * 19) %
        MAX_NODES;
      const anchorOffset = anchor * 3;
      const offset = index * 3;
      const angle = seeded(index, 84 + stage) * Math.PI * 2;
      const vertical = seeded(index, 91 + stage) * 2 - 1;
      const radial = Math.sqrt(Math.max(0, 1 - vertical * vertical));
      densityTarget[offset] =
        nodeTarget[anchorOffset] +
        Math.cos(angle) * radial * spread;
      densityTarget[offset + 1] =
        nodeTarget[anchorOffset + 1] +
        vertical * spread;
      densityTarget[offset + 2] =
        nodeTarget[anchorOffset + 2] +
        Math.sin(angle) * radial * spread;
    }
  }

  const contour = createHumanWitnessShape().getSpacedPoints(1024);
  const humanDensityTarget = densityTargets[5];

  const contains = (x, y) => {
    let inside = false;
    for (
      let index = 0, previous = contour.length - 1;
      index < contour.length;
      previous = index, index += 1
    ) {
      const currentPoint = contour[index];
      const previousPoint = contour[previous];
      const denominator = previousPoint.y - currentPoint.y;
      const crosses =
        currentPoint.y > y !== previousPoint.y > y &&
        x <
          ((previousPoint.x - currentPoint.x) *
            (y - currentPoint.y)) /
            (Math.abs(denominator) < 0.00001 ? 0.00001 : denominator) +
            currentPoint.x;
      if (crosses) {
        inside = !inside;
      }
    }
    return inside;
  };

  const writeHumanDensityPoint = (index, x, y, unrotatedZ) => {
    const headTurn = y > 2.12 ? 0.16 : 0;
    const torsoTilt =
      y <= 2.12 && y > -1.5 ? x * 0.022 : 0;
    const relaxedRightLeg =
      y <= -1.5 && x > 0
        ? Math.sin(range(-y, 1.5, 5.32) * Math.PI) * 0.12
        : 0;
    const posedX =
      x + headTurn + relaxedRightLeg + (y / 5.4) * 0.055;
    const posedY = y + torsoTilt;
    const stance = -0.17;
    const rotatedX =
      posedX * Math.cos(stance) +
      unrotatedZ * Math.sin(stance);
    const rotatedZ =
      -posedX * Math.sin(stance) +
      unrotatedZ * Math.cos(stance);
    const offset = index * 3;
    humanDensityTarget[offset] = rotatedX;
    humanDensityTarget[offset + 1] = posedY;
    humanDensityTarget[offset + 2] = rotatedZ;
  };

  const boundaryTotal = Math.ceil(DENSITY_COUNT / 4);
  let boundaryOrdinal = 0;
  let candidate = 0;

  for (let index = 0; index < DENSITY_COUNT; index += 1) {
    if (index % 4 === 0) {
      const contourProgress =
        (boundaryOrdinal + seeded(index, 87) * 0.42) /
        Math.max(1, boundaryTotal);
      const contourIndex = Math.min(
        contour.length - 1,
        Math.floor(contourProgress * contour.length),
      );
      const point = contour[contourIndex];
      const inset = 0.022 + seeded(index, 88) * 0.1;
      const centerX = point.y > 2.12 ? 0.12 : 0;
      const centerY = point.y > 2.12 ? 3.22 : point.y;
      const shellX =
        point.x + (centerX - point.x) * inset;
      const shellY =
        point.y + (centerY - point.y) * inset * 0.72;
      const shellDepth = (seeded(index, 86) - 0.5) * 0.18;
      writeHumanDensityPoint(
        index,
        shellX,
        shellY,
        shellDepth,
      );
      boundaryOrdinal += 1;
      continue;
    }

    while (candidate < DENSITY_COUNT * 28) {
      const x = -2.72 + seeded(candidate, 81) * 5.44;
      const y = -5.32 + seeded(candidate, 82) * 9.72;
      candidate += 1;
      if (!contains(x, y)) {
        continue;
      }

      let depth = 0.34;
      if (y > 2.12) {
        const headX = x / 0.95;
        const headY = (y - 3.22) / 1.1;
        depth =
          0.18 +
          Math.sqrt(
            Math.max(0, 1 - headX * headX - headY * headY),
          ) *
            0.56;
      } else if (y > -1.48 && Math.abs(x) < 1.52) {
        depth = 0.58;
      } else if (y < -1.48) {
        depth = 0.4;
      }
      writeHumanDensityPoint(
        index,
        x,
        y,
        (seeded(candidate, 83) - 0.5) * depth * 2,
      );
      break;
    }
  }

  return densityTargets;
};

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
      densityCount: Math.min(
        DENSITY_COUNT,
        Math.max(
          1200,
          quality.densityCount ??
            (quality.nodeCount <= 72
              ? 2400
              : quality.nodeCount >= 192
                ? 6000
                : 4200),
        ),
      ),
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
  const densityTargets = buildContinuumDensityTargets(targets);
  const pairSets = buildPairSets();
  const currentPositions = new Float32Array(MAX_NODES * 3);
  const currentDensityPositions = new Float32Array(DENSITY_COUNT * 3);
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
    new THREE.Color(colors.titanium),
  ];
  const mixedColor = new THREE.Color();
  const titaniumColor = new THREE.Color(colors.titanium);
  const amberColor = new THREE.Color(colors.amber);
  const graphiteColor = new THREE.Color(colors.graphite);

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
      transparent: true,
      opacity: 1,
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

  /*
   * The fine density is present for the complete journey. It begins inside
   * entropy, follows every material target, and ultimately supplies the
   * volumetric continuity of the human witness without a late object reveal.
   */
  const continuumPointTexture = createContinuumPointTexture();
  const continuumDensityMaterial = new THREE.PointsMaterial({
    color: colors.violet,
    map: continuumPointTexture,
    alphaTest: 0.012,
    size: 0.045,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    toneMapped: false,
  });
  const continuumDensityGeometry = new THREE.BufferGeometry();
  continuumDensityGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(currentDensityPositions, 3),
  );
  const continuumDensity = new THREE.Points(
    continuumDensityGeometry,
    continuumDensityMaterial,
  );
  continuumDensity.name = 'persistent-continuum-density';
  group.add(continuumDensity);

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
  boundaryGroup.name = 'subordinate-cosmos-reference-field';
  const boundaryMaterial =
    materials.boundary ??
    new THREE.LineBasicMaterial({
      color: colors.amber,
      transparent: true,
      opacity: 0.006,
      depthWrite: false,
    });
  const boundaryPlaneGeometry = createEllipseGeometry(6.7, 4.85);
  const boundaryPlane = new THREE.LineLoop(
    boundaryPlaneGeometry,
    boundaryMaterial,
  );
  boundaryPlane.name = 'human-measure-cosmic-horizon';
  boundaryPlane.position.z = -2.7;
  boundaryPlane.rotation.z = -0.08;
  const boundaryEdgeMaterial =
    materials.boundaryEdge ??
    new THREE.LineBasicMaterial({
      color: colors.amber,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  const boundaryEdges = new THREE.Group();
  boundaryEdges.name = 'receding-cosmic-reference-arcs';
  const innerCosmicArc = new THREE.LineLoop(
    createEllipseGeometry(5.15, 3.78),
    boundaryEdgeMaterial,
  );
  innerCosmicArc.position.z = -2.48;
  innerCosmicArc.rotation.set(0.16, 0.1, 0.12);
  const outerCosmicArc = new THREE.LineLoop(
    createEllipseGeometry(7.55, 5.6),
    boundaryEdgeMaterial,
  );
  outerCosmicArc.position.z = -3.08;
  outerCosmicArc.rotation.set(-0.1, -0.08, -0.18);
  boundaryEdges.add(innerCosmicArc, outerCosmicArc);
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
  phaseTrace.name = 'persistent-human-chest-anchor';
  const phasePearl = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.2, 2),
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
  let witnessPresence = 0;
  let humanWitnessOffsetX = 0;
  let humanWitnessOffsetY = 0;
  let humanWitnessScale = 1;

  const writeCurrentPositions = () => {
    const from = targets[morph.from];
    const to = targets[morph.to];
    const densityFrom = densityTargets[morph.from];
    const densityTo = densityTargets[morph.to];
    const mix = morph.mix;
    const inverse = 1 - mix;
    const count = activeQuality.nodeCount;
    const fromWitnessScale =
      morph.from === 5 ? humanWitnessScale : 1;
    const toWitnessScale =
      morph.to === 5 ? humanWitnessScale : 1;
    const stageScale =
      0.84 +
      (morph.from === 0 ? 0.18 * (1 - mix) : 0) +
      (morph.to === 5 ? 0.2 * mix : 0) -
      witnessPresence * 0.67;

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const fromX = from[offset] * fromWitnessScale;
      const toX = to[offset] * toWitnessScale;
      const fromY =
        morph.from === 5
          ? HUMAN_CHEST_Y +
            (from[offset + 1] - HUMAN_CHEST_Y) * fromWitnessScale
          : from[offset + 1];
      const toY =
        morph.to === 5
          ? HUMAN_CHEST_Y +
            (to[offset + 1] - HUMAN_CHEST_Y) * toWitnessScale
          : to[offset + 1];
      const x =
        fromX * inverse +
        toX * mix +
        humanWitnessOffsetX * witnessPresence;
      const y =
        fromY * inverse +
        toY * mix +
        humanWitnessOffsetY * witnessPresence;
      const z =
        from[offset + 2] * fromWitnessScale * inverse +
        to[offset + 2] * toWitnessScale * mix;
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

    for (
      let index = 0;
      index < activeQuality.densityCount;
      index += 1
    ) {
      const offset = index * 3;
      const fromX = densityFrom[offset] * fromWitnessScale;
      const toX = densityTo[offset] * toWitnessScale;
      const fromY =
        morph.from === 5
          ? HUMAN_CHEST_Y +
            (densityFrom[offset + 1] - HUMAN_CHEST_Y) *
              fromWitnessScale
          : densityFrom[offset + 1];
      const toY =
        morph.to === 5
          ? HUMAN_CHEST_Y +
            (densityTo[offset + 1] - HUMAN_CHEST_Y) *
              toWitnessScale
          : densityTo[offset + 1];
      currentDensityPositions[offset] =
        fromX * inverse +
        toX * mix +
        humanWitnessOffsetX * witnessPresence;
      currentDensityPositions[offset + 1] =
        fromY * inverse +
        toY * mix +
        humanWitnessOffsetY * witnessPresence;
      currentDensityPositions[offset + 2] =
        densityFrom[offset + 2] * fromWitnessScale * inverse +
        densityTo[offset + 2] * toWitnessScale * mix;
    }
    continuumDensityGeometry.setDrawRange(
      0,
      activeQuality.densityCount,
    );
    continuumDensityGeometry.attributes.position.needsUpdate = true;
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
      const fromIndex = set.pairs[pairOffset];
      const toIndex = set.pairs[pairOffset + 1];
      if (fromIndex >= nodeCount || toIndex >= nodeCount) {
        continue;
      }
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
    continuumDensityGeometry.setDrawRange(
      0,
      activeQuality.densityCount,
    );
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
    viewportAspect = 16 / 9,
  } = {}) => {
    if (disposed) {
      return;
    }

    const normalized = clamp01(progress);
    resolveMorph(normalized, morph);
    updateStageWeights();
    witnessPresence =
      morph.from === 5 ? 1 : morph.to === 5 ? morph.mix : 0;
    const desktopComposition = smoothstep(
      range(viewportAspect, 0.82, 1.32),
    );
    const portraitComposition = 1 - desktopComposition;
    humanWitnessOffsetX =
      3.45 + desktopComposition * 2.1;
    humanWitnessOffsetY =
      -1.4 + desktopComposition * 1.4;
    humanWitnessScale =
      0.92 + portraitComposition * 0.03;

    if (corePosition?.isVector3) {
      group.position.copy(corePosition);
    }

    writeCurrentPositions();
    continuumDensityMaterial.opacity =
      0.16 +
      witnessPresence * (0.52 + portraitComposition * 0.1);
    continuumDensityMaterial.size =
      0.045 +
      witnessPresence * (0.027 + portraitComposition * 0.004);

    mixedColor.lerpColors(
      stageColors[morph.from],
      stageColors[morph.to],
      morph.mix,
    );
    authoredNodeMaterial.color
      .copy(mixedColor)
      .lerp(graphiteColor, witnessPresence * 0.22);
    authoredNodeMaterial.emissive.copy(mixedColor);
    authoredNodeMaterial.emissiveIntensity =
      0.035 +
      stageWeights[3] * 0.05 +
      stageWeights[4] * 0.07 +
      witnessPresence * -0.005;
    authoredNodeMaterial.opacity =
      1 - Math.sqrt(witnessPresence) * 0.82;
    continuumDensityMaterial.color
      .copy(mixedColor)
      .lerp(graphiteColor, witnessPresence * 0.72);

    structuralMaterial.color
      .copy(titaniumColor)
      .lerp(mixedColor, 0.2 + stageWeights[4] * 0.2);
    feedbackMaterial.color
      .copy(mixedColor)
      .lerp(amberColor, witnessPresence * 0.68);
    feedbackMaterial.emissive.copy(feedbackMaterial.color);

    if (morph.from === morph.to) {
      updateLinkPool(
        structuralLinks,
        pairSets.structural[morph.from],
        morph.from === 0
          ? 0.12
          : morph.from === 1
            ? 0.22
            : morph.from === 5
              ? 0.065
              : 0.44,
        morph.from === 5 ? 0.5 : 1,
      );
      updateLinkPool(
        feedbackLinks,
        pairSets.feedback[morph.from],
        morph.from === 1
            ? 0.08
            : morph.from === 5
              ? 0.008
            : morph.from >= 3
              ? 0.3
              : 0.17,
        0.88,
      );
    } else {
      const bridge = Math.sin(morph.mix * Math.PI);
      updateLinkPool(
        structuralLinks,
        pairSets.structural[morph.from],
        (1 - morph.mix) ** 2 * 0.34 + bridge * 0.025,
      );
      updateLinkPool(
        feedbackLinks,
        pairSets.structural[morph.to],
        morph.mix ** 2 * 0.2 + bridge * 0.025,
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
        proofPresence ** 2 *
          (1 - witnessPresence) ** 2 *
          (0.66 - index * 0.08) +
          witnessPresence * (0.022 - index * 0.004),
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
      proofPulses[index].visible = proofPresence > 0.015;
    }
    proofLoops.position.set(
      humanWitnessOffsetX * witnessPresence,
      (HUMAN_CHEST_Y + humanWitnessOffsetY) * witnessPresence,
      -1.2 * witnessPresence,
    );
    proofLoops.rotation.set(
      witnessPresence * 0.32,
      witnessPresence * -0.24,
      witnessPresence * 0.1,
    );
    proofLoops.scale.setScalar(1 - witnessPresence * 0.68);

    const accountability = smoothstep(range(normalized, 0.81, 0.91));
    boundaryMaterial.color
      .copy(titaniumColor)
      .lerp(amberColor, accountability);
    boundaryMaterial.opacity = 0.006 + accountability * 0.094;
    boundaryEdgeMaterial.opacity = accountability * 0.18;
    boundaryPlane.visible = boundaryMaterial.opacity > 0.003;
    boundaryEdges.visible = boundaryEdgeMaterial.opacity > 0.003;
    boundaryGroup.position.set(
      humanWitnessOffsetX * witnessPresence,
      (HUMAN_CHEST_Y + humanWitnessOffsetY) * witnessPresence,
      0,
    );

    phaseMaterial.color
      .copy(mixedColor)
      .lerp(amberColor, accountability);
    phaseMaterial.emissive.copy(phaseMaterial.color);
    phaseMaterial.emissiveIntensity =
      0.12 + stageWeights[4] * 0.1 + accountability * 0.18;
    const settledSignal = smoothstep(range(normalized, 0.77, 0.82));
    const travellingFilamentAngle =
      -0.18 + normalized * Math.PI * 0.72;
    phaseFilament.rotation.z =
      travellingFilamentAngle * (1 - settledSignal) +
      Math.PI * 0.5 * settledSignal;
    phaseFilament.rotation.y =
      normalized * Math.PI * 0.34 * (1 - settledSignal);
    phaseFilament.scale.set(
      1 - settledSignal * 0.35,
      1 - settledSignal * 0.65,
      1 - settledSignal * 0.65,
    );
    const signalScale =
      0.82 +
      stageWeights[2] * 0.12 +
      stageWeights[3] * 0.18 +
      settledSignal * -0.22;
    phaseTrace.scale.setScalar(signalScale);
    phaseTrace.position.set(
      humanWitnessOffsetX * witnessPresence,
      (HUMAN_CHEST_Y + humanWitnessOffsetY) * witnessPresence,
      HUMAN_CHEST_Z * witnessPresence,
    );

    if (reducedMotion) {
      phaseFilament.rotation.z =
        (-0.18 + normalized * Math.PI * 0.36) *
          (1 - accountability) +
        Math.PI * 0.5 * accountability;
    }
  };

  setQuality(qualityConfig ?? quality);
  update({ progress: 0, corePosition: signal.position, reducedMotion: true });

  return {
    group,
    root: group,
    core: signal,
    persistentCore: signal,
    finalForm: 'human-witness',
    stageAt: storyStageAt,
    getCoreWorldPosition(output = new THREE.Vector3()) {
      return phasePearl.getWorldPosition(output);
    },
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
      continuumPointTexture.dispose();
    },
  };
}

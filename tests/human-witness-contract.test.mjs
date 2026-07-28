import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from 'three';

import { createEvolutionSystem } from '../public/evolution-system.js';

const evolutionUrl = new URL('../public/evolution-system.js', import.meta.url);

async function evolutionSource() {
  return readFile(evolutionUrl, 'utf8');
}

function finalTargetBlock(source) {
  const start = source.search(
    /const\s+humanWitness\s*=\s*targets\s*\[\s*5\s*\]\s*;/,
  );
  assert.notEqual(
    start,
    -1,
    'the sixth seeded-particle target must be explicitly authored as `humanWitness`',
  );

  const end = source.indexOf('return targets;', start);
  assert.notEqual(
    end,
    -1,
    'the human-witness target should remain part of buildStageTargets()',
  );
  return source.slice(start, end);
}

function numericOpacityTerm(source, expression, message) {
  const match = source.match(expression);
  assert.ok(match, message);
  return match.slice(1).map(Number);
}

function assertSourceMatch(source, expression, message) {
  assert.ok(expression.test(source), message);
}

test('the final seeded-particle target is a legible human witness, not a replacement object', async () => {
  const source = await evolutionSource();
  const human = finalTargetBlock(source);

  assertSourceMatch(
    source,
    /human-witness/i,
    'the final form needs a stable, inspectable human-witness identity',
  );

  for (const bodyRegion of [
    'head',
    'shoulder',
    'torso',
    'arm',
    'pelvis',
    'leg',
  ]) {
    assert.match(
      human,
      new RegExp(bodyRegion, 'i'),
      `the human target must intentionally author the ${bodyRegion} region`,
    );
  }

  assert.match(
    human,
    /setTarget\s*\(\s*humanWitness\s*,\s*index\b/,
    'the existing particle population must morph into the human target',
  );
  assert.doesNotMatch(
    human,
    /new\s+THREE\.(?:Group|Mesh|SkinnedMesh|Object3D)\b/,
    'the human conclusion must not arrive as an object swap',
  );
  assertSourceMatch(
    source,
    /nodes\.name\s*=\s*['"]seeded-material-population['"]/,
    'the final form must preserve the original seeded material population',
  );
  assertSourceMatch(
    source,
    /continuumDensity\.name\s*=\s*['"]persistent-continuum-density['"]/,
    'the fine human density must exist as one persistent continuum',
  );
  assert.doesNotMatch(
    source,
    /coalesced-human-witness-density/,
    'the human silhouette must not arrive as a final-only density object',
  );
  assert.doesNotMatch(
    source,
    /\b(?:robot|android|cyborg|humanoid|mannequin|avatar)\b/i,
    'the anthropocentric finale should read as a human witness, not a robot trope',
  );
});

test('the persistent signal becomes the human chest anchor', async () => {
  const source = await evolutionSource();

  assertSourceMatch(
    source,
    /phaseTrace\.name\s*=\s*['"][^'"]*human[^'"]*chest[^'"]*anchor[^'"]*['"]/i,
    'the persistent phase trace must be explicitly identified as the human chest anchor',
  );
  assertSourceMatch(
    source,
    /signal\.add\s*\(\s*phaseTrace\s*\)/,
    'the chest anchor must preserve the one persistent signal instead of replacing it',
  );
});

test('the cosmos is explicitly subordinate to the final human form', async () => {
  const source = await evolutionSource();

  assertSourceMatch(
    source,
    /boundaryGroup\.name\s*=\s*['"][^'"]*(?:subordinate[^'"]*cosm|cosm[^'"]*subordinate)[^'"]*['"]/i,
    'the final spatial field must declare the cosmos as subordinate to the human witness',
  );

  const [baseOpacity, accountabilityGain] = numericOpacityTerm(
    source,
    /boundaryMaterial\.opacity\s*=\s*(0?\.\d+)\s*\+\s*accountability\s*\*\s*(0?\.\d+)/,
    'the boundary membrane opacity should remain an explicit, reviewable hierarchy',
  );
  const [edgeGain] = numericOpacityTerm(
    source,
    /boundaryEdgeMaterial\.opacity\s*=\s*accountability\s*\*\s*(0?\.\d+)/,
    'the cosmic boundary edge opacity should remain an explicit, reviewable hierarchy',
  );

  assert.ok(
    baseOpacity + accountabilityGain <= 0.12,
    `cosmic membrane max opacity must stay at or below 0.12; found ${
      baseOpacity + accountabilityGain
    }`,
  );
  assert.ok(
    edgeGain <= 0.2,
    `cosmic edge max opacity must stay at or below 0.20; found ${edgeGain}`,
  );
});

test('the persistent continuum becomes a complete human at every quality tier', () => {
  const qualities = [
    ['low', 72],
    ['balanced', 128],
    ['high', 192],
  ];

  for (const [quality, expectedNodes] of qualities) {
    const evolution = createEvolutionSystem({ quality });
    const nodes = evolution.group.getObjectByName(
      'seeded-material-population',
    );
    const density = evolution.group.getObjectByName(
      'persistent-continuum-density',
    );
    const structure = evolution.group.getObjectByName(
      'morphing-structure-link-pool',
    );

    assert.ok(nodes?.isInstancedMesh);
    assert.ok(density?.isPoints);
    assert.ok(structure?.isInstancedMesh);

    evolution.update({
      progress: 0,
      viewportAspect: 16 / 9,
      reducedMotion: true,
    });
    const densityUuid = density.uuid;
    const openingPositions = density.geometry
      .getAttribute('position')
      .array.slice();
    const openingOpacity = density.material.opacity;

    evolution.update({
      progress: 1,
      viewportAspect: 16 / 9,
      reducedMotion: true,
    });

    assert.equal(nodes.count, expectedNodes);
    assert.equal(density.uuid, densityUuid);
    assert.ok(openingOpacity >= 0.15);
    assert.ok(density.material.opacity > openingOpacity);
    assert.notDeepEqual(
      density.geometry.getAttribute('position').array,
      openingPositions,
    );
    assert.ok(
      structure.count >= Math.min(48, expectedNodes - 12),
      `${quality} must preserve the connected human chain`,
    );

    const matrix = new THREE.Matrix4();
    const positions = [];
    for (let index = 0; index < nodes.count; index += 1) {
      nodes.getMatrixAt(index, matrix);
      positions.push(
        new THREE.Vector3().setFromMatrixPosition(matrix),
      );
    }

    const minY = Math.min(...positions.map((point) => point.y));
    const maxY = Math.max(...positions.map((point) => point.y));
    const centerX = 5.55;
    assert.ok(maxY - minY > 8, `${quality} must preserve full height`);
    assert.ok(
      positions.some(
        (point) => point.y > 2.5 && point.x < centerX - 0.3,
      ),
      `${quality} must preserve the head`,
    );
    assert.ok(
      positions.some(
        (point) => point.x < centerX - 1.8 && point.y > -1.7,
      ),
      `${quality} must preserve the left arm`,
    );
    assert.ok(
      positions.some(
        (point) => point.x > centerX + 1.8 && point.y > -1.7,
      ),
      `${quality} must preserve the right arm`,
    );
    assert.ok(
      positions.some(
        (point) => point.y < -2.5 && point.x < centerX - 0.25,
      ),
      `${quality} must preserve the left leg`,
    );
    assert.ok(
      positions.some(
        (point) => point.y < -2.5 && point.x > centerX + 0.25,
      ),
      `${quality} must preserve the right leg`,
    );

    const chest = evolution.getCoreWorldPosition(new THREE.Vector3());
    assert.ok(
      chest.distanceTo(new THREE.Vector3(5.55, 0.62, 0.42)) < 0.01,
    );
    evolution.dispose();
  }
});

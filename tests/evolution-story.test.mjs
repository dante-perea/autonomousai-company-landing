import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  STORY_BEATS,
  storyBeatAt,
  storyBeatIndexAt,
  storyStageAt,
} from '../public/foundry-story.js';

test('maps the existing business beats onto one ordered evolutionary continuum', () => {
  assert.deepEqual(
    STORY_BEATS.map(({ id, stage }) => [id, stage]),
    [
      ['intention', 'entropy'],
      ['execution', 'atoms'],
      ['verification', 'dna'],
      ['frontiers', 'intelligence'],
      ['scale', 'autonomous-company'],
      ['judgement', 'founder-boundary'],
    ],
  );

  assert.equal(STORY_BEATS[0].start, 0);
  assert.equal(STORY_BEATS.at(-1).end, 1);

  for (let index = 1; index < STORY_BEATS.length; index += 1) {
    assert.equal(STORY_BEATS[index - 1].end, STORY_BEATS[index].start);
  }
});

test('clamps progress and returns deterministic story state at every boundary', () => {
  const samples = [
    [-1, 0, 'intention', 'entropy'],
    [0.105, 1, 'execution', 'atoms'],
    [0.275, 2, 'verification', 'dna'],
    [0.425, 3, 'frontiers', 'intelligence'],
    [0.625, 4, 'scale', 'autonomous-company'],
    [0.81, 5, 'judgement', 'founder-boundary'],
    [2, 5, 'judgement', 'founder-boundary'],
  ];

  for (const [progress, expectedIndex, expectedId, expectedStage] of samples) {
    assert.equal(storyBeatIndexAt(progress), expectedIndex);
    assert.equal(storyBeatAt(progress).id, expectedId);
    assert.equal(storyStageAt(progress), expectedStage);
  }
});

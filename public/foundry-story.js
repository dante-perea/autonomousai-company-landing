const clampProgress = (value) =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export const STORY_BEATS = Object.freeze([
  Object.freeze({ id: 'intention', start: 0, end: 0.105, stage: 'entropy' }),
  Object.freeze({ id: 'execution', start: 0.105, end: 0.275, stage: 'atoms' }),
  Object.freeze({ id: 'verification', start: 0.275, end: 0.425, stage: 'dna' }),
  Object.freeze({ id: 'frontiers', start: 0.425, end: 0.625, stage: 'intelligence' }),
  Object.freeze({
    id: 'scale',
    start: 0.625,
    end: 0.81,
    stage: 'autonomous-company',
  }),
  Object.freeze({
    id: 'judgement',
    start: 0.81,
    end: 1,
    stage: 'founder-boundary',
  }),
]);

export const storyBeatIndexAt = (progress) => {
  const normalized = clampProgress(progress);

  for (let index = STORY_BEATS.length - 1; index > 0; index -= 1) {
    if (normalized >= STORY_BEATS[index].start) {
      return index;
    }
  }

  return 0;
};

export const storyBeatAt = (progress) => STORY_BEATS[storyBeatIndexAt(progress)];

export const storyStageAt = (progress) => storyBeatAt(progress).stage;

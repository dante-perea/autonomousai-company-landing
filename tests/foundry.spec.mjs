import { expect, test } from '@playwright/test';

const CAMERA_SAMPLE_PROGRESS = [0.06, 0.28, 0.5, 0.72];
const JUDGEMENT_SAMPLE_PROGRESS = [0.88, 0.98];

async function waitForFoundry(page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            typeof window.__TAIC_FOUNDRY__ === 'object' &&
            typeof window.__TAIC_FOUNDRY__?.getSnapshot === 'function',
        ),
      { message: 'window.__TAIC_FOUNDRY__.getSnapshot() should be available' },
    )
    .toBe(true);
}

async function readFoundrySnapshot(page) {
  return page.evaluate(() => {
    const snapshot = window.__TAIC_FOUNDRY__?.getSnapshot?.();
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }

    const cameraPosition =
      snapshot.cameraPosition ?? snapshot.camera?.position ?? snapshot.camera?.worldPosition;
    const camera =
      Array.isArray(cameraPosition) || ArrayBuffer.isView(cameraPosition)
        ? Array.from(cameraPosition).slice(0, 3).map(Number)
        : cameraPosition && typeof cameraPosition === 'object'
          ? [cameraPosition.x, cameraPosition.y, cameraPosition.z].map(Number)
          : null;

    return {
      progress: Number(
        snapshot.progress ??
          snapshot.normalizedProgress ??
          snapshot.journey?.progress ??
          Number.NaN,
      ),
      coreUuid:
        snapshot.coreUuid ??
        snapshot.coreUUID ??
        snapshot.core?.uuid ??
        snapshot.core?.id ??
        null,
      beatIndex: Number(
        snapshot.beatIndex ??
          snapshot.activeBeatIndex ??
          snapshot.beat?.index ??
          Number.NaN,
      ),
      beatId:
        snapshot.beatId ??
        snapshot.activeBeat ??
        snapshot.beat?.id ??
        snapshot.beat?.name ??
        null,
      camera,
      rendererCount: Number(
        snapshot.rendererCount ??
          snapshot.renderers?.length ??
          snapshot.renderer?.count ??
          Number.NaN,
      ),
      rendererId:
        snapshot.rendererId ?? snapshot.renderer?.uuid ?? snapshot.renderer?.id ?? null,
      renderState:
        snapshot.renderState ??
        snapshot.renderer?.state ??
        document.documentElement.dataset.renderState ??
        null,
    };
  });
}

async function settleFrames(page, milliseconds = 260) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
  await page.waitForTimeout(milliseconds);
}

async function scrollToDocumentProgress(page, progress, settleMilliseconds = 320) {
  await page.evaluate((nextProgress) => {
    const maximumScroll = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    window.scrollTo(0, maximumScroll * nextProgress);
    window.dispatchEvent(new Event('scroll'));
  }, progress);
  await settleFrames(page, settleMilliseconds);
  return readFoundrySnapshot(page);
}

function cameraDistance(left, right) {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

function snapshotBeatIndex(snapshot, beatIds) {
  if (Number.isInteger(snapshot?.beatIndex)) {
    return snapshot.beatIndex;
  }
  return beatIds.indexOf(snapshot?.beatId);
}

async function readCanvasPixels(page) {
  return page.locator('#foundry-canvas').evaluate(
    (canvas) =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          const gl =
            canvas.getContext('webgl2') ||
            canvas.getContext('webgl') ||
            canvas.getContext('experimental-webgl');
          if (!gl) {
            resolve({
              hasContext: false,
              width: 0,
              height: 0,
              nonEmptySamples: 0,
              uniqueColorBuckets: 0,
            });
            return;
          }

          gl.finish();
          const width = gl.drawingBufferWidth;
          const height = gl.drawingBufferHeight;
          const pixels = new Uint8Array(width * height * 4);
          gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

          const buckets = new Set();
          let nonEmptySamples = 0;
          const sampleStride = Math.max(1, Math.floor((width * height) / 60_000));

          for (let pixel = 0; pixel < width * height; pixel += sampleStride) {
            const offset = pixel * 4;
            const red = pixels[offset];
            const green = pixels[offset + 1];
            const blue = pixels[offset + 2];
            if (red > 2 || green > 2 || blue > 2) {
              nonEmptySamples += 1;
            }
            buckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
          }

          resolve({
            hasContext: true,
            width,
            height,
            nonEmptySamples,
            uniqueColorBuckets: buckets.size,
          });
        });
      }),
  );
}

test.describe('Autonomous Foundry production contract', () => {
  test('mounts one renderer, six semantic beats, and no retired visual system', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForFoundry(page);

    await expect(page.locator('#foundry-canvas')).toHaveCount(1);
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.locator('[data-beat]')).toHaveCount(6);
    await expect(
      page.locator('#gpu-field, .optical-stage, [data-optical-surface]'),
    ).toHaveCount(0);

    for (const beat of await page.locator('[data-beat]').all()) {
      await expect(beat.locator('h1, h2, h3').first()).toBeAttached();
    }

    const snapshot = await readFoundrySnapshot(page);
    expect(snapshot).not.toBeNull();
    expect(snapshot.rendererCount).toBe(1);
    expect(snapshot.coreUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  test('reports normalized, reversible progress while preserving the core identity', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForFoundry(page);

    const forward = [];
    for (const progress of [0, 0.24, 0.52, 0.8, 1]) {
      forward.push(await scrollToDocumentProgress(page, progress));
    }

    const reverse = [];
    for (const progress of [0.52, 0.18, 0]) {
      reverse.push(await scrollToDocumentProgress(page, progress));
    }

    const snapshots = [...forward, ...reverse];
    for (const snapshot of snapshots) {
      expect(snapshot.progress).toBeGreaterThanOrEqual(0);
      expect(snapshot.progress).toBeLessThanOrEqual(1);
    }

    for (let index = 1; index < forward.length; index += 1) {
      expect(forward[index].progress).toBeGreaterThan(forward[index - 1].progress);
    }
    for (let index = 1; index < reverse.length; index += 1) {
      expect(reverse[index].progress).toBeLessThan(reverse[index - 1].progress);
    }

    expect(forward.at(-1).progress - forward[0].progress).toBeGreaterThan(0.9);
    expect(reverse.at(-1).progress).toBeLessThan(0.08);
    expect(new Set(snapshots.map((snapshot) => snapshot.coreUuid)).size).toBe(1);
  });

  test('moves the camera through the journey and parks it for judgement', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForFoundry(page);

    const journey = [];
    for (const progress of CAMERA_SAMPLE_PROGRESS) {
      journey.push(await scrollToDocumentProgress(page, progress, 420));
    }

    for (const snapshot of journey) {
      expect(snapshot.camera).toHaveLength(3);
      expect(snapshot.camera.every(Number.isFinite)).toBe(true);
    }

    const uniquePositions = new Set(
      journey.map((snapshot) =>
        snapshot.camera.map((coordinate) => coordinate.toFixed(3)).join(':'),
      ),
    );
    const movement = journey
      .slice(1)
      .map((snapshot, index) => cameraDistance(journey[index].camera, snapshot.camera));

    expect(uniquePositions.size).toBe(4);
    expect(Math.min(...movement)).toBeGreaterThan(0.01);

    const judgement = [];
    for (const progress of JUDGEMENT_SAMPLE_PROGRESS) {
      judgement.push(await scrollToDocumentProgress(page, progress, 700));
    }

    const beatIds = await page
      .locator('[data-beat]')
      .evaluateAll((beats) => beats.map((beat) => beat.getAttribute('data-beat')));
    expect(snapshotBeatIndex(judgement[0], beatIds)).toBe(5);
    expect(snapshotBeatIndex(judgement[1], beatIds)).toBe(5);

    const parkedDistance = cameraDistance(
      judgement[0].camera,
      judgement[1].camera,
    );
    expect(parkedDistance).toBeLessThan(Math.min(...movement) * 0.1 + 0.001);
  });

  test('advances all six beats in document order', async ({ page }) => {
    await page.goto('/');
    await waitForFoundry(page);

    const beats = page.locator('[data-beat]');
    const beatIds = await beats.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-beat')),
    );
    const visited = [];

    for (let index = 0; index < 6; index += 1) {
      await beats.nth(index).evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const absoluteTop = window.scrollY + bounds.top;
        const target =
          absoluteTop + Math.min(bounds.height, window.innerHeight) / 2 - window.innerHeight / 2;
        window.scrollTo(0, Math.max(0, target));
        window.dispatchEvent(new Event('scroll'));
      });
      await settleFrames(page, 360);
      visited.push(snapshotBeatIndex(await readFoundrySnapshot(page), beatIds));
    }

    expect(visited).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('has no horizontal overflow at phone and desktop widths', async ({ page }) => {
    for (const width of [320, 393, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 852 : 1000 });
      await page.goto('/');

      const overflow = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));

      expect(overflow.document, `${width}px document width`).toBeLessThanOrEqual(
        overflow.viewport + 1,
      );
      expect(overflow.body, `${width}px body width`).toBeLessThanOrEqual(
        overflow.viewport + 1,
      );
    }
  });

  test('uses normal-flow beats and a static renderer for reduced motion', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: { width: 393, height: 852 },
    });
    const page = await context.newPage();

    try {
      await page.goto('/');
      await waitForFoundry(page);

      const beatStates = await page.locator('[data-beat]').evaluateAll((beats) =>
        beats.map((beat) => {
          const style = getComputedStyle(beat);
          return {
            position: style.position,
            display: style.display,
            visibility: style.visibility,
            opacity: Number(style.opacity),
            height: beat.getBoundingClientRect().height,
            hasHeading: Boolean(beat.querySelector('h1, h2, h3')),
          };
        }),
      );

      expect(beatStates).toHaveLength(6);
      for (const state of beatStates) {
        expect(['static', 'relative']).toContain(state.position);
        expect(state.display).not.toBe('none');
        expect(state.visibility).not.toBe('hidden');
        expect(state.opacity).toBeGreaterThan(0.99);
        expect(state.height).toBeGreaterThan(0);
        expect(state.hasHeading).toBe(true);
      }

      const snapshot = await readFoundrySnapshot(page);
      expect(['static', 'fallback']).toContain(snapshot.renderState);
    } finally {
      await context.close();
    }
  });

  test('keeps every beat heading and the thesis path readable without JavaScript', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 393, height: 852 },
    });
    const page = await context.newPage();

    try {
      await page.goto('/');

      const beats = page.locator('[data-beat]');
      await expect(beats).toHaveCount(6);
      for (let index = 0; index < 6; index += 1) {
        await expect(beats.nth(index).locator('h1, h2, h3').first()).toBeVisible();
      }
      await expect(page.locator('a[href*="thesis"]').first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('fails open to a readable static landing when WebGL is unavailable', async ({
    page,
  }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.addInitScript(() => {
      const disableWebGl = (prototype) => {
        const original = prototype?.getContext;
        if (typeof original !== 'function') {
          return;
        }
        Object.defineProperty(prototype, 'getContext', {
          configurable: true,
          value(type, ...arguments_) {
            if (/^(webgl2?|experimental-webgl)$/i.test(String(type))) {
              return null;
            }
            return original.call(this, type, ...arguments_);
          },
        });
      };

      disableWebGl(HTMLCanvasElement.prototype);
      if ('OffscreenCanvas' in window) {
        disableWebGl(OffscreenCanvas.prototype);
      }
    });

    await page.goto('/');
    await waitForFoundry(page);

    await expect(page.locator('[data-beat]')).toHaveCount(6);
    for (const heading of await page.locator('[data-beat] h1, [data-beat] h2, [data-beat] h3').all()) {
      await expect(heading).toBeVisible();
    }
    await expect(page.locator('a[href*="thesis"]').first()).toBeVisible();

    const snapshot = await readFoundrySnapshot(page);
    expect(['static', 'fallback']).toContain(snapshot.renderState);
    expect(pageErrors).toEqual([]);
  });

  test('renders non-empty canvas pixels at the hero and mid-journey', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'One direct framebuffer probe is sufficient');

    await page.goto('/');
    await waitForFoundry(page);

    await scrollToDocumentProgress(page, 0.03, 420);
    const hero = await readCanvasPixels(page);
    await scrollToDocumentProgress(page, 0.52, 420);
    const middle = await readCanvasPixels(page);

    for (const frame of [hero, middle]) {
      expect(frame.hasContext).toBe(true);
      expect(frame.width).toBeGreaterThan(0);
      expect(frame.height).toBeGreaterThan(0);
      expect(frame.nonEmptySamples).toBeGreaterThan(0);
      expect(frame.uniqueColorBuckets).toBeGreaterThan(1);
    }
  });

  test('emits no uncaught page errors across the full journey', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/');
    await waitForFoundry(page);
    for (const progress of [0, 0.25, 0.5, 0.75, 1, 0.4]) {
      await scrollToDocumentProgress(page, progress, 220);
    }

    expect(pageErrors).toEqual([]);
  });
});

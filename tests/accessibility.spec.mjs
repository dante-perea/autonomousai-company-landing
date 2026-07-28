import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG_A_AA_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
];

async function waitForFoundry(page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => {
            if (typeof window.__TAIC_FOUNDRY__?.getSnapshot !== 'function') {
              return false;
            }
            return window.__TAIC_FOUNDRY__.getSnapshot().renderState !== 'loading';
          },
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
}

async function abortExternalFonts(page) {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
}

async function disableWebGL(page) {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...arguments_) {
      if (/^(webgl2?|experimental-webgl)$/i.test(String(type))) {
        return null;
      }
      return originalGetContext.call(this, type, ...arguments_);
    };
  });
}

for (const path of ['/', '/thesis/']) {
  test(`${path} has no automatically detectable WCAG A/AA violations`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await abortExternalFonts(page);
    if (path === '/') {
      // The canvas is decorative; Foundry's renderer behavior is exercised separately.
      await disableWebGL(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    if (path === '/') {
      await waitForFoundry(page);
    }

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_A_AA_TAGS)
      .analyze();

    expect(results.violations).toEqual([]);
  });
}

test('the animated verification beat retains WCAG A/AA semantics and contrast', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await abortExternalFonts(page);
  await disableWebGL(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForFoundry(page);
  await page.evaluate(() => {
    // Isolate the authored full-motion DOM/CSS state from headless GPU timing.
    const root = document.documentElement;
    root.classList.remove('foundry-fallback');
    root.classList.add('motion-enabled');
    root.dataset.foundryReady = 'true';
    root.dataset.motion = 'full';
    window.__TAIC_FOUNDRY__.seek(0.32, true);
  });

  await expect(page.locator('html')).toHaveAttribute(
    'data-active-beat',
    'verification',
  );
  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'Execution creates output. Verification turns it into value.',
    }),
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .include('#verification')
    .withTags(WCAG_A_AA_TAGS)
    .analyze();

  expect(results.violations).toEqual([]);
});

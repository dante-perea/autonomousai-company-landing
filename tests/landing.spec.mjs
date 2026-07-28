import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { width: 320, height: 720 },
  { width: 360, height: 800 },
  { width: 393, height: 852 },
  { width: 768, height: 900 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1728, height: 995 },
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

async function preferLowPowerRenderer(page) {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { saveData: true },
      });
    } catch {
      // The runtime still selects a compact quality tier on constrained browsers.
    }
  });
}

test('presents the succinct thesis as six semantic beats and a complete whitepaper path', async ({
  page,
}) => {
  await abortExternalFonts(page);
  await disableWebGL(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForFoundry(page);

  await expect(page).toHaveTitle(/The Autonomous AI Company/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /Zero standing\s+employees\./i,
  );
  const openingLede = page.locator('#intention .foundry-beat__lede');
  await expect(openingLede).toBeVisible();
  await expect(openingLede).toContainText(/Not because people lack value/i);
  await expect(openingLede).toContainText(
    /Work has always been a proxy for value creation/i,
  );

  const beatContract = await page.locator('[data-beat]').evaluateAll((beats) =>
    beats.map((beat) => {
      const heading = beat.querySelector('h1, h2');
      return {
        id: beat.id,
        index: Number(beat.dataset.beatIndex),
        name: beat.dataset.beatName,
        labelledBy: beat.getAttribute('aria-labelledby'),
        headingId: heading?.id ?? null,
        heading: heading?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      };
    }),
  );

  expect(beatContract).toEqual([
    {
      id: 'intention',
      index: 0,
      name: 'intention',
      labelledBy: 'intention-title',
      headingId: 'intention-title',
      heading: 'Zero standing employees.',
    },
    {
      id: 'execution',
      index: 1,
      name: 'execution',
      labelledBy: 'execution-title',
      headingId: 'execution-title',
      heading: 'The cost of turning intention into output is collapsing.',
    },
    {
      id: 'verification',
      index: 2,
      name: 'verification',
      labelledBy: 'verification-title',
      headingId: 'verification-title',
      heading: 'Execution creates output. Verification turns it into value.',
    },
    {
      id: 'frontiers',
      index: 3,
      name: 'frontiers',
      labelledBy: 'frontiers-title',
      headingId: 'frontiers-title',
      heading: 'Same loop. Different cost of proof.',
    },
    {
      id: 'scale',
      index: 4,
      name: 'scale',
      labelledBy: 'scale-title',
      headingId: 'scale-title',
      heading: 'Company. CRO. Lab.',
    },
    {
      id: 'judgement',
      index: 5,
      name: 'judgement',
      labelledBy: 'judgement-title',
      headingId: 'judgement-title',
      heading: 'Everything delegated. Except judgement.',
    },
  ]);

  await expect(page.locator('#frontiers')).toContainText('Software has been solved.');
  await expect(page.locator('#frontiers')).toContainText('Verification is next.');
  await expect(page.locator('#scale')).toContainText('Zero-people company');
  await expect(page.locator('#scale')).toContainText('Zero-people CRO');
  await expect(page.locator('#scale')).toContainText('Zero-people lab');
  await expect(page.locator('#judgement')).toContainText(
    /remains accountable for irreversible decisions/i,
  );

  const whitepaperLinks = page.locator('a[href="./thesis/"]');
  await expect(whitepaperLinks).toHaveCount(2);
  const headerWhitepaper = page.locator('.foundry-thesis-link--header');
  await expect(headerWhitepaper).toBeVisible();
  await expect(headerWhitepaper.locator('.foundry-thesis-link__long')).toHaveText(
    'Founding whitepaper',
  );
  await expect(
    page.getByRole('link', {
      name: 'Read the founding whitepaper',
      exact: true,
    }),
  ).toBeAttached();
});

test('publishes the complete founder thesis as a dedicated readable document', async ({
  page,
}) => {
  await abortExternalFonts(page);
  await page.goto('/thesis/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('script[src*="site.js"]')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { level: 1, name: 'The Autonomous AI Company' }),
  ).toBeVisible();
  await expect(page.locator('#value')).toContainText(
    /work has always been a proxy for value creation/i,
  );
  await expect(page.locator('#research')).toContainText(
    /Capital converts into scientific progress/i,
  );
  await expect(
    page.locator('#company'),
  ).toContainText(/Zero people describes the direction, not the objective/i);
  await expect(
    page.locator('#company'),
  ).toContainText(/remain accountable for irreversible decisions/i);
  await expect(
    page.getByRole('heading', { name: /Which valuable loops can we close first/i }),
  ).toBeVisible();
  await expect(page.locator('#sources li')).toHaveCount(6);
  await expect(
    page.getByRole('link', { name: /Back to the company/i }).first(),
  ).toBeVisible();
});

test('keeps both header lockups on one line at every supported width', async ({ page }) => {
  test.setTimeout(60_000);
  await abortExternalFonts(page);
  await disableWebGL(page);

  for (const target of [
    { path: '/', selector: '.foundry-header .foundry-lockup > span' },
    { path: '/thesis/', selector: '.site-header .brand__name' },
  ]) {
    await page.setViewportSize(VIEWPORTS[0]);
    await page.goto(target.path, { waitUntil: 'domcontentloaded' });

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      const lockup = page.locator(target.selector);
      await expect(lockup).toHaveText('The Autonomous AI Company');

      const metrics = await lockup.evaluate((element) => {
        const style = getComputedStyle(element);
        const range = document.createRange();
        range.selectNodeContents(element);
        const textLines = [...range.getClientRects()].filter(
          (rectangle) => rectangle.width > 0 && rectangle.height > 0,
        );
        return {
          whiteSpace: style.whiteSpace,
          textLines: textLines.length,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
        };
      });

      expect(metrics.whiteSpace).toBe('nowrap');
      expect(metrics.textLines).toBe(1);
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    }
  }
});

test('locks a stable system face when the display fonts miss their deadline', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'One delayed-font runtime probe is sufficient');
  test.setTimeout(45_000);

  await disableWebGL(page);
  await page.route('https://fonts.gstatic.com/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_400));
    await route.continue().catch(() => {});
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('html')).toHaveClass(/font-fallback/, { timeout: 5_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[data-taic-font-resource]')).toHaveCount(0);

  const firstLine = page.locator('#intention-title [data-mask-line]').first();
  const settledWidth = await firstLine.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  await page.waitForTimeout(1_700);
  const lateWidth = await firstLine.evaluate(
    (element) => element.getBoundingClientRect().width,
  );

  expect(Math.abs(lateWidth - settledWidth)).toBeLessThan(0.5);
});

test('keeps the landing and complete thesis readable without JavaScript or external fonts', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 393, height: 852 },
  });
  const page = await context.newPage();

  try {
    await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
    await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const headings = page.locator('[data-beat] h1, [data-beat] h2');
    await expect(headings).toHaveCount(6);
    for (let index = 0; index < 6; index += 1) {
      await expect(headings.nth(index)).toBeVisible();
    }
    await expect(page.locator('a[href="./thesis/"]').first()).toBeVisible();

    await page.goto('/thesis/', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { level: 1, name: 'The Autonomous AI Company' }),
    ).toBeVisible();
    await expect(
      page.getByText(/work has always been a proxy for value creation/i),
    ).toBeVisible();
    await expect(
      page.getByText(/The Autonomous AI Company is my exploration function/i),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test('exposes active, context-loss, and restored WebGL renderer states', async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== 'chromium', 'One direct WebGL lifecycle probe is sufficient');
  test.setTimeout(60_000);
  await abortExternalFonts(page);
  await preferLowPowerRenderer(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForFoundry(page);

  const initial = await page.evaluate(() => window.__TAIC_FOUNDRY__.getSnapshot());
  test.skip(
    initial.renderer === 'fallback' || initial.renderer === 'none',
    'A WebGL lifecycle requires an available renderer',
  );

  await expect
    .poll(() =>
      page.evaluate(() => window.__TAIC_FOUNDRY__.getSnapshot().renderState),
    )
    .toBe('active');
  await expect(page.locator('html')).toHaveAttribute('data-gpu', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-renderer', /webgl2|webgl1/);

  const prevented = await page.locator('#foundry-canvas').evaluate((canvas) => {
    const event = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(() => window.__TAIC_FOUNDRY__.getSnapshot().renderState),
      { timeout: 15_000 },
    )
    .toBe('paused');

  await page.locator('#foundry-canvas').evaluate((canvas) => {
    canvas.dispatchEvent(new Event('webglcontextrestored'));
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => window.__TAIC_FOUNDRY__.getSnapshot().renderState),
      { timeout: 15_000 },
    )
    .toBe('active');
});

test('serves the Foundry runtime, whitepaper, brand assets, and social card', async ({
  page,
  request,
}) => {
  const responses = await Promise.all([
    request.get('/styles.css'),
    request.get('/foundry.css'),
    request.get('/site.js'),
    request.get('/foundry-world.js'),
    request.get('/thesis/'),
    request.get('/logo-mark.svg'),
    request.get('/wordmark-white.png'),
    request.get('/og-card.png'),
  ]);

  for (const response of responses) {
    expect(response.ok(), `${response.url()} should be present in the built site`).toBe(true);
  }

  await abortExternalFonts(page);
  await disableWebGL(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(
    page.locator('link[href$="cinematic.css"], script[src$="gpu-background.js"]'),
  ).toHaveCount(0);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://autonomousai.company/og-card.png',
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
    'content',
    '1200',
  );
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute(
    'content',
    '630',
  );
});

test('loads the animated landing and static whitepaper without client errors', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      message.text() !== 'Failed to load resource: net::ERR_FAILED'
    ) {
      errors.push(message.text());
    }
  });

  test.setTimeout(60_000);
  await abortExternalFonts(page);
  await preferLowPowerRenderer(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForFoundry(page);
  const reducedSnapshot = await page.evaluate(() =>
    window.__TAIC_FOUNDRY__.getSnapshot(),
  );
  expect(reducedSnapshot.reducedMotion).toBe(true);
  expect(reducedSnapshot.renderState).toBe('static');

  await page.goto('/thesis/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

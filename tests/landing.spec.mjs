import { expect, test } from '@playwright/test';

test('presents a succinct company overview derived from the thesis', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/The Autonomous AI Company/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /from companies with fewer people.*one-person companies.*zero standing employees/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Not because people lack value/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /Read the thesis/i }).first()).toHaveAttribute(
    'href',
    './thesis/',
  );
  await expect(page.getByRole('heading', { name: 'Software has been solved.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Verification is next.' })).toBeVisible();
  await expect(page.getByText(/Zero people is the direction.*Value creation is the objective/i)).toBeVisible();
  await expect(page.getByText(/Everything delegated/i)).toBeVisible();
  await expect(page.getByText(/Except judgement/i)).toBeVisible();
});

test('keeps the brand lockup on one horizontal line', async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 360, height: 800 },
    { width: 393, height: 852 },
    { width: 768, height: 900 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 1728, height: 995 },
  ]) {
    await page.setViewportSize(viewport);

    for (const path of ['/', '/thesis/']) {
      await page.goto(path);
      const lockup = await page.locator('.brand__name').evaluate((element) => {
        const styles = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return {
          height: bounds.height,
          lineHeight: Number.parseFloat(styles.lineHeight),
          whiteSpace: styles.whiteSpace,
        };
      });

      expect(lockup.whiteSpace).toBe('nowrap');
      expect(lockup.height).toBeLessThanOrEqual(lockup.lineHeight * 1.15);
    }
  }
});

test('composes the landing as four concise chapters with a dedicated accountability climax', async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 995 });
  await page.goto('/');

  const screens = await page.locator('main > section').evaluateAll((sections) =>
    sections.map((section) => ({
      id: section.id,
      height: section.getBoundingClientRect().height,
    })),
  );

  expect(screens.map((screen) => screen.id)).toEqual(['top', 'model', 'frontiers', 'company']);
  for (const screen of screens.slice(0, 3)) {
    expect(screen.height, `${screen.id} should read as one screen`).toBeGreaterThanOrEqual(850);
    expect(screen.height, `${screen.id} should not become a long essay`).toBeLessThanOrEqual(1100);
  }

  expect(screens.at(-1).height).toBeGreaterThanOrEqual(1700);
  expect(screens.at(-1).height).toBeLessThanOrEqual(2200);

  for (const selector of ['.company-frame', '.founder-boundary']) {
    const frameHeight = await page.locator(selector).evaluate((element) =>
      element.getBoundingClientRect().height,
    );
    expect(frameHeight, `${selector} should own one deliberate frame`).toBeGreaterThanOrEqual(850);
    expect(frameHeight, `${selector} should remain concise`).toBeLessThanOrEqual(1100);
  }
});

test('orchestrates each landing argument as a one-shot motion group', async ({ page }) => {
  await page.goto('/');

  for (const name of ['hero', 'loop', 'frontiers', 'company-path', 'founder-boundary']) {
    const group = page.locator(`[data-motion-group="${name}"]`);
    await group.scrollIntoViewIfNeeded();
    await expect(group).toHaveClass(/is-visible/);
  }
});

test('starts the cinematic narrative with only the hero scene active', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(100);

  await expect(page.locator('html')).toHaveAttribute('data-scene', 'hero');
  const activeGroups = await page
    .locator('[data-motion-group].is-visible')
    .evaluateAll((groups) => groups.map((group) => group.dataset.motionGroup));

  expect(activeGroups).toEqual(['hero']);
});

test('fails open if the motion controller cannot load', async ({ page }) => {
  await page.route('**/site.js', (route) => route.abort());
  await page.goto('/');
  await page.waitForTimeout(2700);

  await expect(page.locator('html')).not.toHaveClass(/motion-enabled/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Close valuable loops.' })).toBeVisible();
});

test('restores the GPU field as a rendered visual layer', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#gpu-field')).toBeAttached();
  await expect(page.locator('#agent-swarm')).toHaveCount(0);
  await expect(page.locator('.cinematic-overlay')).toBeAttached();
  await expect(page.locator('html')).toHaveAttribute('data-gpu', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-renderer', /webgl2|webgl1/);
  await expect(page.locator('html')).toHaveAttribute('data-quality', /high|balanced|low/);

  const canvasState = await page.evaluate(() => {
    const field = document.querySelector('#gpu-field');
    const gl = field.getContext('webgl2') || field.getContext('webgl');
    return {
      fieldWidth: field.width,
      fieldHeight: field.height,
      hasLinkedProgram: Boolean(gl.getParameter(gl.CURRENT_PROGRAM)),
    };
  });

  expect(canvasState.fieldWidth).toBeGreaterThan(0);
  expect(canvasState.fieldHeight).toBeGreaterThan(0);
  expect(canvasState.hasLinkedProgram).toBeTruthy();
});

test('scrubs one proof signal reversibly through the four thesis scenes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-scene', 'hero');
  const topPosition = Number(await page.locator('html').getAttribute('data-scene-position'));

  await page.locator('#model').scrollIntoViewIfNeeded();
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'loop');
  const loopPosition = Number(await page.locator('html').getAttribute('data-scene-position'));

  await page.locator('#frontiers').scrollIntoViewIfNeeded();
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'frontiers');
  const frontierPosition = Number(await page.locator('html').getAttribute('data-scene-position'));

  await page.locator('#company').scrollIntoViewIfNeeded();
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'company');
  const companyPosition = Number(await page.locator('html').getAttribute('data-scene-position'));

  expect(topPosition).toBeLessThan(loopPosition);
  expect(loopPosition).toBeLessThan(frontierPosition);
  expect(frontierPosition).toBeLessThan(companyPosition);

  await page.locator('#top').scrollIntoViewIfNeeded();
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'hero');
  const returnedPosition = Number(await page.locator('html').getAttribute('data-scene-position'));
  expect(returnedPosition).toBeLessThan(loopPosition);

  const proofState = await page.evaluate(() => ({
    documentProgress: getComputedStyle(document.documentElement)
      .getPropertyValue('--document-progress')
      .trim(),
    signalCount: document.querySelectorAll('[data-proof-signal]').length,
    diagnostics: window.__TAIC_CINEMATIC__?.getSnapshot?.(),
  }));

  expect(proofState.documentProgress).not.toBe('');
  expect(proofState.signalCount).toBeGreaterThan(0);
  expect(proofState.diagnostics?.scene).toBe('hero');
});

test('authors live reduced-motion and context-loss states', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'running');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'static');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'running');

  const prevented = await page.locator('#gpu-field').evaluate((canvas) => {
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    return lost.defaultPrevented;
  });
  expect(prevented).toBeTruthy();
  await expect(page.locator('html')).toHaveAttribute('data-gpu', 'context-lost');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'paused');

  await page.locator('#gpu-field').evaluate((canvas) => {
    canvas.dispatchEvent(new Event('webglcontextrestored'));
  });
  await expect(page.locator('html')).toHaveAttribute('data-gpu', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'running');
});

test('rebuilds GPU resources cleanly after a real context loss', async ({ page }) => {
  const consoleMessages = [];
  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-gpu', 'ready');

  const supportsContextLoss = await page.locator('#gpu-field').evaluate((canvas) => {
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const extension = context?.getExtension('WEBGL_lose_context');
    if (!extension) {
      return false;
    }

    window.__taicContextLossExtension = extension;
    extension.loseContext();
    return true;
  });

  test.skip(!supportsContextLoss, 'WEBGL_lose_context is unavailable in this browser');
  await expect(page.locator('html')).toHaveAttribute('data-gpu', 'context-lost');

  await page.evaluate(() => window.__taicContextLossExtension.restoreContext());
  await expect(page.locator('html')).toHaveAttribute('data-gpu', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'running');
  await expect
    .poll(() => page.evaluate(() => window.__TAIC_CINEMATIC__.getSnapshot().frames))
    .toBeGreaterThan(1);

  expect(
    consoleMessages.filter((message) =>
      /INVALID_OPERATION.*delete|delete: object does not belong to this context/i.test(message),
    ),
  ).toEqual([]);
});

test('freezes the reduced-motion GPU until its framebuffer needs resizing', async ({ browser }) => {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 320, height: 240 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'static');
  await page.waitForTimeout(120);

  const initial = await page.evaluate(() => window.__TAIC_CINEMATIC__.getSnapshot());
  const qualityCaps = { low: 320_000, balanced: 640_000, high: 1_100_000 };
  expect(initial.frames).toBe(1);
  expect(initial.pixelCount).toBeGreaterThan(320 * 240);
  expect(initial.pixelCount).toBeLessThanOrEqual(qualityCaps[initial.quality]);

  await page.evaluate(() => {
    for (let index = 0; index < 8; index += 1) {
      window.dispatchEvent(new CustomEvent('taic:motion-state'));
      window.scrollTo(0, index * 20);
    }
  });
  await page.waitForTimeout(160);

  const frozen = await page.evaluate(() => window.__TAIC_CINEMATIC__.getSnapshot());
  expect(frozen.frames).toBe(initial.frames);

  await page.setViewportSize({ width: 360, height: 240 });
  await page.waitForTimeout(120);
  const resized = await page.evaluate(() => window.__TAIC_CINEMATIC__.getSnapshot());
  expect(resized.frames).toBeGreaterThan(initial.frames);
  expect(resized.frames - initial.frames).toBeLessThanOrEqual(2);
  expect(resized.pixelCount).toBeLessThanOrEqual(qualityCaps[resized.quality]);

  await context.close();
});

test('uses WebGL1 when WebGL2 is unavailable and caps framebuffer work', async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      if (type === 'webgl2') {
        return null;
      }
      return originalGetContext.call(this, type, ...args);
    };
  });

  await page.setViewportSize({ width: 1728, height: 995 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-gpu', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-renderer', 'webgl1');

  const snapshot = await page.evaluate(() => window.__TAIC_CINEMATIC__.getSnapshot());
  expect(snapshot.pixelCount).toBeLessThanOrEqual(1_100_000);
});

test('keeps explicit low-power profiles below the adaptive promotion ladder', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });
  });

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-gpu', 'ready');
  const snapshot = await page.evaluate(() => window.__TAIC_CINEMATIC__.getSnapshot());
  expect(snapshot.quality).toBe('low');
  expect(snapshot.qualityCeiling).toBe('low');
  expect(snapshot.pixelCount).toBeLessThanOrEqual(320_000);
});

test('retries with WebGL1 when WebGL2 shader initialization fails', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Chromium provides a reliable WebGL2 test surface');
  await page.addInitScript(() => {
    const prototype = window.WebGL2RenderingContext?.prototype;
    if (!prototype) {
      return;
    }
    const original = prototype.getShaderParameter;
    prototype.getShaderParameter = function getShaderParameter(shader, parameter) {
      if (parameter === this.COMPILE_STATUS) {
        return false;
      }
      return original.call(this, shader, parameter);
    };
  });

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-gpu', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-renderer', 'webgl1');
  const snapshot = await page.evaluate(() => window.__TAIC_CINEMATIC__.getSnapshot());
  expect(snapshot.frames).toBeGreaterThan(0);
});

test('retries with WebGL1 when the first WebGL2 draw reports an error', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Chromium provides a reliable WebGL2 test surface');
  await page.addInitScript(() => {
    const prototype = window.WebGL2RenderingContext?.prototype;
    if (!prototype) {
      return;
    }
    const original = prototype.getError;
    let injectedFailure = false;
    prototype.getError = function getError() {
      if (!injectedFailure) {
        injectedFailure = true;
        return this.INVALID_OPERATION;
      }
      return original.call(this);
    };
  });

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-gpu', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-renderer', 'webgl1');
  const snapshot = await page.evaluate(() => window.__TAIC_CINEMATIC__.getSnapshot());
  expect(snapshot.frames).toBeGreaterThan(1);
});

test('resumes exactly one cinematic loop after a BFCache-style restore', async ({ page }) => {
  await page.goto('/');
  const before = await page.evaluate(() => window.__TAIC_CINEMATIC__.getSnapshot().frames);

  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  });
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'paused');

  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'running');
  await page.waitForTimeout(180);

  const after = await page.evaluate(() => window.__TAIC_CINEMATIC__.getSnapshot().frames);
  expect(after).toBeGreaterThan(before);
  expect(after - before).toBeLessThan(30);
});

test('falls back gracefully when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') {
        return null;
      }
      return originalGetContext.call(this, type, ...args);
    };
  });

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-gpu', 'fallback');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('serves the production assets, whitepaper, and social preview card', async ({ page, request }) => {
  const responses = await Promise.all([
    request.get('/styles.css'),
    request.get('/site.js'),
    request.get('/gpu-background.js'),
    request.get('/thesis/'),
    request.get('/logo-mark.svg'),
    request.get('/wordmark-white.png'),
    request.get('/og-card.png'),
  ]);

  for (const response of responses) {
    expect(response.ok(), `${response.url()} should be present in the built site`).toBeTruthy();
  }

  await page.goto('/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://autonomousai.company/og-card.png',
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
});

test('loads the landing page and whitepaper without client errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-gpu', /ready|fallback/);
  await page.goto('/thesis/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  expect(errors).toEqual([]);
});

test('publishes the complete thesis and keeps the accountable founder', async ({ page }) => {
  await page.goto('/thesis/');

  await expect(page.locator('script[src*="site.js"]')).toHaveCount(0);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /The Autonomous AI Company/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/work has always been a proxy for value creation/i)).toBeVisible();
  await expect(page.getByText(/Capital converts into scientific progress/i)).toBeVisible();
  await expect(page.getByText(/Zero people describes the direction, not the objective/i)).toBeVisible();
  await expect(page.getByText(/remain accountable for irreversible decisions/i)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /which valuable loops can we close first/i }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Back to the company/i }).first()).toBeVisible();
});

test('fits desktop and mobile viewports without horizontal clipping', async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 720 },
    { width: 360, height: 800 },
    { width: 393, height: 852 },
    { width: 768, height: 900 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 1728, height: 995 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of ['/', '/thesis/']) {
      await page.goto(path);

      const dimensions = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('contentinfo')).toBeVisible();
    }
  }
});

test('remains readable when motion is reduced', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('html')).not.toHaveClass(/motion-enabled/);

  const motionState = await page.locator('[data-motion-group="hero"]').evaluate((element) => {
    const styles = getComputedStyle(element);
    return { opacity: styles.opacity, transform: styles.transform };
  });
  expect(motionState).toEqual({ opacity: '1', transform: 'none' });

  await context.close();
});

test('keeps the complete thesis visible without JavaScript or external fonts', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Read the thesis/i }).first()).toBeVisible();

  await page.goto('/thesis/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/work has always been a proxy for value creation/i)).toBeVisible();

  await context.close();
});

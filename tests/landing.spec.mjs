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

test('composes the landing as four narrative screens', async ({ page }) => {
  await page.setViewportSize({ width: 1728, height: 995 });
  await page.goto('/');

  const screens = await page.locator('main > section').evaluateAll((sections) =>
    sections.map((section) => ({
      id: section.id,
      height: section.getBoundingClientRect().height,
    })),
  );

  expect(screens.map((screen) => screen.id)).toEqual(['top', 'model', 'frontiers', 'company']);
  for (const screen of screens) {
    expect(screen.height, `${screen.id} should read as one screen`).toBeGreaterThanOrEqual(850);
    expect(screen.height, `${screen.id} should not become a long essay`).toBeLessThanOrEqual(1100);
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

test('does not animate offscreen sections during GPU startup', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(100);

  const activeGroups = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === 'running')
      .map((animation) =>
        animation.effect?.target?.closest?.('[data-motion-group]')?.dataset.motionGroup,
      )
      .filter(Boolean),
  );

  expect([...new Set(activeGroups)]).toEqual(['hero']);
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
  await expect(page.locator('#agent-swarm')).toBeAttached();
  await expect(page.locator('html')).toHaveAttribute('data-gpu', 'ready');

  const canvasState = await page.evaluate(() => {
    const field = document.querySelector('#gpu-field');
    const swarm = document.querySelector('#agent-swarm');
    const gl = field.getContext('webgl');
    return {
      fieldWidth: field.width,
      fieldHeight: field.height,
      swarmWidth: swarm.width,
      swarmHeight: swarm.height,
      hasLinkedProgram: Boolean(gl.getParameter(gl.CURRENT_PROGRAM)),
    };
  });

  expect(canvasState.fieldWidth).toBeGreaterThan(0);
  expect(canvasState.fieldHeight).toBeGreaterThan(0);
  expect(canvasState.swarmWidth).toBeGreaterThan(0);
  expect(canvasState.swarmHeight).toBeGreaterThan(0);
  expect(canvasState.hasLinkedProgram).toBeTruthy();
});

test('falls back gracefully when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      if (type === 'webgl' || type === 'experimental-webgl') {
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

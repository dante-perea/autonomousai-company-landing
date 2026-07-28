import { expect, test } from '@playwright/test';

test('presents a succinct company overview derived from the thesis', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/The Autonomous AI Company/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /companies with fewer people.*one-person companies.*zero standing employees/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Not because people lack value/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /Read the whitepaper/i }).first()).toHaveAttribute(
    'href',
    './thesis/',
  );
  await expect(page.getByRole('heading', { name: 'Software has been solved.' })).toBeVisible();
  await expect(page.getByText(/The next frontier is making scientific verification/i)).toBeVisible();
  await expect(page.getByText(/Zero people describes the direction, not the objective/i)).toBeVisible();
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
    { width: 1440, height: 900 },
    { width: 393, height: 852 },
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

  await context.close();
});

test('keeps the complete thesis visible without JavaScript or external fonts', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Read the whitepaper/i }).first()).toBeVisible();

  await page.goto('/thesis/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/work has always been a proxy for value creation/i)).toBeVisible();

  await context.close();
});

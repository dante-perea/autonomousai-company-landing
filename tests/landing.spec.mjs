import { expect, test } from '@playwright/test';

test('presents the founder thesis and its two layers', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/The Autonomous AI Company/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /companies with fewer people.*one-person companies.*zero standing employees/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Not because people lack value/i)).toBeVisible();

  await page.goto('/#applications');
  await expect(page.getByRole('heading', { name: 'Software has been solved.' })).toBeVisible();
  await expect(page.getByText(/what “solved” means/i)).toBeVisible();

  await page.goto('/#research');
  await expect(page.getByRole('heading', { name: 'The next frontier is verification.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Anthropic, Claude Science' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Periodic Labs', exact: true })).toBeVisible();
});

test('serves the production assets and social preview card', async ({ page, request }) => {
  const responses = await Promise.all([
    request.get('/styles.css'),
    request.get('/site.js'),
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

test('keeps the accountable founder and valuable loop as the conclusion', async ({ page }) => {
  await page.goto('/');

  await page.goto('/#company');
  await expect(
    page.getByRole('heading', {
      name: /The Autonomous AI Company is my exploration function for this future/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Zero people describes the direction, not the objective/i)).toBeVisible();
  await expect(page.getByText(/remain accountable for irreversible decisions/i)).toBeVisible();

  await page.goto('/#first-move');
  await expect(
    page.getByRole('heading', { name: /which valuable loops can we close first/i }),
  ).toBeVisible();
  await expect(page.getByText('Make verification cheap', { exact: true })).toBeVisible();
});

test('fits desktop and mobile viewports without horizontal clipping', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 393, height: 852 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');

    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
  }
});

test('remains readable when motion is reduced', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: /The Autonomous AI Company is my exploration function for this future/i,
    }),
  ).toBeVisible();

  await context.close();
});

test('keeps the complete thesis visible without JavaScript or external fonts', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: /The Autonomous AI Company is my exploration function for this future/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /which valuable loops can we close first/i }),
  ).toBeVisible();

  await context.close();
});

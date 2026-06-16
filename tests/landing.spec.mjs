import { expect, test } from '@playwright/test';

test('renders the handoff hero and live canvases', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('The singularity is here')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Software has been solved\./i })).toBeVisible();
  await expect(page.getByText('The agentic web is live.')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(2);

  const glCanvas = page.locator('canvas').first();
  await expect.poll(async () => {
    return glCanvas.evaluate((canvas) => ({
      width: canvas.width,
      height: canvas.height,
    }));
  }).toMatchObject({ width: expect.any(Number), height: expect.any(Number) });

  const canvasSize = await glCanvas.evaluate((canvas) => ({ width: canvas.width, height: canvas.height }));
  expect(canvasSize.width).toBeGreaterThan(100);
  expect(canvasSize.height).toBeGreaterThan(100);

  await expect.poll(async () => {
    return glCanvas.evaluate((canvas) => {
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 0;

      const samples = [
        [0.25, 0.25],
        [0.5, 0.5],
        [0.75, 0.75],
        [0.35, 0.65],
        [0.65, 0.35],
      ];

      let litSamples = 0;
      for (const [xRatio, yRatio] of samples) {
        const pixel = new Uint8Array(4);
        gl.readPixels(
          Math.max(0, Math.floor(canvas.width * xRatio)),
          Math.max(0, Math.floor(canvas.height * yRatio)),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel,
        );
        if (pixel[0] + pixel[1] + pixel[2] > 8) litSamples += 1;
      }

      return litSamples;
    });
  }).toBeGreaterThan(0);
});

test('switches manifesto question tabs and accepts the founder signal', async ({ page }) => {
  await page.goto('/');

  await page.locator('#two-questions').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /02 · Knowledge/i }).click();
  await expect(page.getByText('The Question of Knowledge')).toBeVisible();
  await expect(page.getByText('new knowledge?')).toBeVisible();

  await page.locator('input[type="email"]').fill('founder@example.ai');
  await page.getByRole('button', { name: /join/i }).click();
  await expect(page.getByText('Signal received. Welcome to the singularity.')).toBeVisible();
});

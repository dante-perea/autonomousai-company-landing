import { defineConfig, devices } from '@playwright/test';

const previewPort = process.env.TAIC_OPERATOR_PREVIEW_PORT || '42731';
const previewUrl = `http://127.0.0.1:${previewPort}`;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  webServer: {
    command: `npm run preview -- --port ${previewPort}`,
    url: previewUrl,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  use: {
    baseURL: previewUrl,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } },
    },
    {
      name: 'webkit-desktop',
      use: {
        ...devices['Desktop Safari'],
        browserName: 'webkit',
        viewport: { width: 1440, height: 1100 },
      },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 15'], browserName: 'webkit' },
    },
  ],
});

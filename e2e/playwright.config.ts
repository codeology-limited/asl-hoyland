import { defineConfig, devices } from '@playwright/test';

// E2E config kept OUT of the vitest scope (vitest only globs src/**/__tests__).
// `npm run e2e` starts the vite dev server automatically (or reuses one already
// running on :1420). Browsers: `npx playwright install chromium` once.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  outputDir: './test-results',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:1420',
    viewport: { width: 1366, height: 940 },
    actionTimeout: 12_000,
    trace: 'retain-on-failure',
    launchOptions: { slowMo: process.env.HEADED || !process.env.CI ? 120 : 0 }, // watchable in headed mode
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

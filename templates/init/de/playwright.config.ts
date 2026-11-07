import { defineConfig } from '@playwright/test';

// The flow tests share one database and change it, so they run one after another.
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/artifacts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  reporter: [['list'], ['json', { outputFile: './test-results/results.json' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://example.ddev.site',
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 1000 },
    trace: 'retain-on-failure',
    actionTimeout: 30_000,
  },
});

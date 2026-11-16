import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './packages/ui-svelte/test/browser',
  outputDir: 'test-results',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4178' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm exec vite --config packages/ui-svelte/test/browser/vite.config.ts',
    url: 'http://127.0.0.1:4178',
    reuseExistingServer: false,
  },
});

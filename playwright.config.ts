import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  expect: { timeout: 10000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1100 },
    permissions: ['camera'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173',
    env: { BUILD_ENV: 'production' },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});

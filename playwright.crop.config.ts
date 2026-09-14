import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testMatch: 'crop-practice.spec.ts',
  use: { ...base.use, permissions: [], launchOptions: {} },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        permissions: ['camera'],
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
    },
    { name: 'webkit', grep: /real model and cropped full app/, use: { browserName: 'webkit' } },
  ],
});

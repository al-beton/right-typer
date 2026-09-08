import { test, expect } from '@playwright/test';
test('bundled real model runs on a fake camera; no external network requests', async ({
  page,
  baseURL,
}) => {
  const external: string[] = [],
    errors: string[] = [],
    requested: string[] = [];
  page.on('request', (r) => {
    requested.push(r.url());
    if (new URL(r.url()).origin !== new URL(baseURL!).origin) external.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#camera-badge')).toContainText('0 hands detected', { timeout: 45000 });
  await expect(page.locator('#tracking-readout')).toContainText('Capture → result');
  await expect(page.locator('#requested-key')).toHaveText('Mark q in the image');
  expect(requested.some((u) => u.includes('hand_landmarker.task'))).toBe(true);
  expect(requested.some((u) => u.endsWith('.wasm'))).toBe(true);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/real-model-no-hands.png', fullPage: true });
});

import { test, expect } from '@playwright/test';
test('bundled real model runs on a fake camera; no external network requests', async ({ page }) => {
  const external: string[] = [],
    errors: string[] = [],
    requested: string[] = [];
  page.on('request', (r) => {
    requested.push(r.url());
    if (!r.url().startsWith('http://127.0.0.1:4173/')) external.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up your camera' }).click();
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await expect(page.locator('#camera-badge')).toContainText('0 / 2 hands', { timeout: 45000 });
  await expect(page.locator('#tracking-readout')).toContainText('Capture → result');
  await page.getByRole('button', { name: 'Map the key positions' }).click();
  await expect(page.getByRole('heading', { name: 'Show me the q key.' })).toBeVisible();
  expect(requested.some((u) => u.includes('hand_landmarker.task'))).toBe(true);
  expect(requested.some((u) => u.endsWith('.wasm'))).toBe(true);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/real-model-no-hands.png', fullPage: true });
});

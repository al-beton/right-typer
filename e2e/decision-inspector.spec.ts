import { expect, test } from '@playwright/test';
import { openSettings, press, resumePractice, setup, syntheticCamera } from './helpers';

test('explicit one-press inspection survives resume, preserves metadata, and clears with setup', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  await openSettings(page);
  await page.locator('#decision-inspector summary').click();
  await page.getByRole('button', { name: 'Inspect next press', exact: true }).click();
  await resumePractice(page);
  await press(page, 'a', 'left-ring');
  await openSettings(page);
  const readout = page.locator('[data-decision]');
  await expect(readout).toContainText('left-ring');
  const first = JSON.parse((await readout.textContent())!);
  expect(first.press.key).toBe('a');
  expect(first.calibration.keyPoint).toBeDefined();
  expect(first.source.build).toMatch(/^[0-9a-f]{40}$/);
  expect(first.observation.finger).toBe('left-ring');
  expect(first.candidates[0].landmarkIndex).toBe(16);
  expect(first.selectedFrame.id).toBe(first.observation.frameIds[0]);
  expect(first.selectedFrame.hands).toBeUndefined();
  expect(first.source.crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  await resumePractice(page);
  await press(page, 's', 'left-little');
  await openSettings(page);
  expect(JSON.parse((await readout.textContent())!)).toEqual(first);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.locator('#decision-inspector').scrollIntoViewIfNeeded();
  await readout.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.waitForTimeout(250);
  await page.screenshot({
    path: 'test-results/alo292-inspector-synthetic.png',
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Clear decision', exact: true }).click();
  await expect(readout).toHaveText('No decision captured.');
  await page.getByRole('button', { name: 'Inspect next press', exact: true }).click();
  await page.locator('#disconnect-camera').click();
  await expect(readout).toHaveText('No decision captured.');
  await page.reload();
  await expect(readout).toHaveText('No decision captured.');
});

test('arming ignores an older pending press and captures the first new request', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  await page.evaluate(() => {
    window.__inferenceDelay = 1400;
  });
  await page.waitForTimeout(120);
  await page.locator('#typing').press('a');
  await openSettings(page);
  await page.locator('#decision-inspector summary').click();
  await page.getByRole('button', { name: 'Inspect next press', exact: true }).click();
  const readout = page.locator('[data-decision]');
  await page.waitForTimeout(1200);
  await expect(readout).toContainText('Waiting for the next');
  await page.locator('#diagnostic').press('s');
  await page.locator('#diagnostic').press('d');
  await expect(readout).toContainText('"key": "s"');
  await page.waitForTimeout(1500);
  expect(JSON.parse((await readout.textContent())!).press.key).toBe('s');
});

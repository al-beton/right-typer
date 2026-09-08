import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticCamera, setup, press } from './helpers';
import { unarchive, sha256 } from '../src/recording/archive';
import { replaySample } from '../src/recording/replay';
import type { Sample } from '../src/recording/types';
import type { FingeringMode } from '../src/core/keyboard';

async function recordedSample(page: import('@playwright/test').Page) {
  await page.locator('#sample-stop').click();
  await expect(page.locator('#sample-download')).toBeEnabled({ timeout: 30000 });
  const download = page.waitForEvent('download');
  await page.locator('#sample-download').click();
  const file = await download;
  const bytes = await readFile((await file.path())!);
  const files = unarchive(bytes);
  const text = (name: string) => new TextDecoder().decode(files[name]);
  const lines = (name: string) =>
    text(name)
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  const sample: Sample = {
    manifest: JSON.parse(text('manifest.json')),
    calibration: JSON.parse(text('calibration.json')),
    events: lines('events.jsonl'),
    frames: lines('frames.jsonl'),
    labels: lines('labels.jsonl'),
  };
  for (const [name, info] of Object.entries(sample.manifest.files)) {
    expect(files[name]?.length).toBe(info.bytes);
    expect(await sha256(files[name]!.slice().buffer as ArrayBuffer)).toBe(info.sha256);
  }
  return { sample, files, download: file };
}
for (const mode of ['standard', 'alternate', 'either'] as FingeringMode[]) {
  test(`record, download and repeatably replay ${mode} sample`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await syntheticCamera(page);
    await setup(page);
    await expect(page.locator('#sample-panel')).toBeHidden();
    await page.goto('/?record=1');
    await expect(page.locator('#sample-start')).toBeEnabled();
    await page.locator('#fingering-mode').selectOption(mode);
    await page.locator('#sample-start').click();
    await expect(page.locator('#sample-status')).toContainText('Recording');
    await press(page, 'w', 'left-ring');
    await press(page, ' ', 'right-thumb');
    await expect(page.locator('#retry')).toBeVisible();
    const { sample, files, download } = await recordedSample(page);
    await download.saveAs(testInfo.outputPath(`${mode}.tar`));
    expect(sample.manifest.mode).toBe(mode);
    expect(sample.calibration.deviceId).toBe('sample-camera');
    expect(sample.frames.length).toBeGreaterThan(2);
    expect(files['camera.webm']!.length).toBeGreaterThan(100);
    expect(
      sample.frames.every((f) => new TextDecoder().decode(files[f.file]!.slice(1, 4)) === 'PNG'),
    ).toBe(true);
    const report = await replaySample(sample);
    expect(report.differences).toEqual([]);
    expect(await replaySample(sample)).toEqual(report);
    expect(report.settledPresses).toBe(2);
    expect(report.submittedWords).toBe(1);
    expect(report.groundTruth.confirmed).toBe(0);
    const verdict = sample.events.find((e) => e.type === 'verdict');
    expect(verdict?.type === 'verdict' && verdict.verdict.wrong.length).toBe(
      mode === 'alternate' ? 1 : 0,
    );
    expect(errors).toEqual([]);
    await page.locator('#sample-discard').click();
    await expect(page.locator('#sample-start')).toBeEnabled();
  });
}
test('stops before mode or geometry changes; discard allows a new sample', async ({ page }) => {
  await syntheticCamera(page);
  await setup(page);
  await page.goto('/?record=1');
  await expect(page.locator('#sample-start')).toBeEnabled();
  await page.locator('#sample-start').click();
  await press(page, 'f');
  await page.locator('#fingering-mode').selectOption('either');
  await expect(page.locator('#sample-download')).toBeEnabled();
  await expect(page.locator('#sample-status')).toContainText('fingering-mode-changed');
  await page.locator('#sample-discard').click();
  await page.locator('#sample-start').click();
  await press(page, 'f');
  await page.locator('#camera-rotation').selectOption('90');
  await expect(page.locator('#sample-download')).toBeEnabled();
  await expect(page.locator('#sample-status')).toContainText('camera-view-changed');
  await page.locator('#sample-discard').click();
});

test('disconnect finalizes recording and reconnect permits a new sample', async ({ page }) => {
  await syntheticCamera(page);
  await setup(page);
  await page.goto('/?record=1');
  await expect(page.locator('#sample-start')).toBeEnabled();
  await page.locator('#sample-start').click();
  await press(page, 'f');
  await page.locator('#disconnect-camera').click();
  await expect(page.locator('#sample-download')).toBeEnabled();
  await expect(page.locator('#sample-status')).toContainText('camera-disconnected');
  expect(await page.locator('#camera').evaluate((v: HTMLVideoElement) => v.srcObject)).toBeNull();
  await page.locator('#sample-discard').click();
  await expect(page.locator('#sample-start')).toBeDisabled();
  await page.locator('#start-camera').click();
  await expect(page.locator('#sample-start')).toBeEnabled();
  await page.locator('#sample-start').click();
  await press(page, 'f');
  await recordedSample(page);
  await page.locator('#sample-discard').click();
});

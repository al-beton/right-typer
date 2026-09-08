import { PRESETS, calibrationCodes } from '../src/core/profile';
import { handsAt, calibration } from '../tests/fixtures';
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

for (const [profileId, key, code, finger, shiftKey] of [
  ['de-iso', 'z', 'KeyY', 'right-index', false],
  ['fr-iso', '.', 'Comma', 'right-middle', true],
] as const) {
  test(`profile snapshot and physical-code replay: ${profileId}`, async ({ page }) => {
    await syntheticCamera(page);
    await page.goto('/?record=1');
    await expect(page.locator('#camera-badge')).toContainText('hands detected');
    const profile = PRESETS.find((p) => p.id === profileId)!;
    await page.locator('#keyboard-profile').selectOption(profileId);
    const points = Object.fromEntries(
      calibrationCodes(profile).map((code) => {
        const physical = profile.keys.find((k) => k.code === code);
        return [
          code,
          code === 'space-left'
            ? { x: 0.25, y: 0.85 }
            : code === 'space-right'
              ? { x: 0.65, y: 0.85 }
              : { x: 0.1 + physical!.x * 0.07, y: 0.2 + physical!.y * 0.2 },
        ];
      }),
    );
    for (const point of Object.values(points)) {
      const box = await page.locator('#overlay').boundingBox();
      await page
        .locator('#overlay')
        .click({ position: { x: point.x * box!.width, y: point.y * box!.height } });
    }
    await expect(page.locator('#sample-start')).toBeEnabled();
    await page.locator('#sample-start').click();
    await page.evaluate(
      (hands) => {
        window.__hands = hands;
      },
      handsAt(code, finger, { ...calibration(), points }),
    );
    await page.waitForTimeout(150);
    await page.locator('#typing').dispatchEvent('keydown', { key, code, shiftKey });
    await page.locator('#typing').dispatchEvent('keyup', { key, code, shiftKey });
    await page.waitForTimeout(150);
    await press(page, ' ', 'right-thumb');
    await expect(page.locator('#retry')).toBeVisible();
    const { sample } = await recordedSample(page);
    expect(sample.manifest.schemaVersion).toBe(2);
    expect(sample.calibration.profile).toEqual(profile);
    expect(sample.manifest.expectedFingers[code]).toContain(finger);
    const request = sample.events.find((e) => e.type === 'evidence' && e.event.type === 'request');
    expect(
      request?.type === 'evidence' && request.event.type === 'request' && request.event.press.code,
    ).toBe(code);
    expect(
      sample.events.some((e) => e.type === 'key' && e.code === code && e.shiftKey === shiftKey),
    ).toBe(true);
    sample.labels[0] = {
      ...sample.labels[0]!,
      status: 'confirmed',
      finger,
      source: 'Synthetic test fixture, not human evidence',
    };
    const report = await replaySample(sample);
    expect(report.differences).toEqual([]);
    expect(report.groundTruth.correctPresses).toBe(1);
    expect(report.groundTruth.correctPressesRejected).toBe(0);
    const bad = structuredClone(sample);
    delete bad.calibration.profile;
    await expect(replaySample(bad)).rejects.toThrow('Profile snapshot');
    if (request?.type === 'evidence' && request.event.type === 'request')
      delete request.event.press.allowedFingers;
    await expect(replaySample(sample)).rejects.toThrow('allowed-finger snapshot');
    await page.locator('#sample-discard').click();
    await page.locator('#sample-start').click();
    await press(page, 'f');
    await page.locator('#keyboard-profile').selectOption('us-ansi');
    await expect(page.locator('#sample-download')).toBeEnabled();
    await expect(page.locator('#sample-status')).toContainText('keyboard-profile-changed');
    await page.locator('#sample-discard').click();
    await page.locator('#keyboard-profile').selectOption(profileId);
    await page.locator('#sample-start').click();
    await press(page, 'f');
    await page.locator('#custom-layout').click();
    await expect(page.locator('#sample-download')).toBeEnabled();
    await expect(page.locator('#sample-status')).toContainText('keyboard-profile-edit');
    await page.locator('#sample-discard').click();
  });
}

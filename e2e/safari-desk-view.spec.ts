import { test, expect } from '@playwright/test';
import { syntheticCamera, openSettings, resumePractice } from './helpers';
import { calibration } from '../tests/fixtures';

test('experiment waits for consent, refreshes devices, selects exactly and stops', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as unknown as { requests: unknown[] }).requests = [];
    navigator.mediaDevices.getUserMedia = (constraints) => {
      (window as unknown as { requests: unknown[] }).requests.push(constraints);
      return original(constraints);
    };
  });
  await page.goto('/?safariDeskView=1');
  await expect(page.locator('#desk-message')).toContainText('Camera has not been requested');
  expect(
    await page.evaluate(() => (window as unknown as { requests: unknown[] }).requests),
  ).toEqual([]);
  await page.locator('#desk-refresh').click();
  await expect(page.locator('#desk-device')).toContainText('Synthetic camera');
  await page.locator('#desk-device').selectOption('synthetic-macbook-camera');
  await page.locator('#desk-size').selectOption('1920');
  await page.locator('#desk-start').click();
  await expect(page.locator('#desk-report')).toContainText('"status": "ready"');
  await expect(page.locator('#desk-report')).toContainText('"clock": "unavailable"');
  expect(
    await page.evaluate(() => (window as unknown as { requests: unknown[] }).requests),
  ).toEqual([
    {
      audio: false,
      video: {
        deviceId: { exact: 'synthetic-macbook-camera' },
        width: { ideal: 1920 },
        height: { ideal: 1440 },
        frameRate: { ideal: 30 },
      },
    },
  ]);
  await page.locator('#desk-stop').click();
  await expect(page.locator('#desk-report')).toContainText('"status": "off"');
  expect(
    await page.locator('video').evaluate((video: HTMLVideoElement) => video.srcObject),
  ).toBeNull();
  await page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));
  await expect(page.locator('#desk-report')).toContainText('devicechange event received');
});

test('permission probe releases tracks; missing capture time stays unavailable through inference', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as unknown as { probeStreams: MediaStream[] }).probeStreams = [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      (window as unknown as { probeStreams: MediaStream[] }).probeStreams.push(stream);
      return stream;
    };
    const request = HTMLVideoElement.prototype.requestVideoFrameCallback;
    HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) {
      return request.call(this, (now, metadata) => {
        delete metadata.captureTime;
        callback(now, metadata);
      });
    };
  });
  await page.goto('/?safariDeskView=1');
  await page.locator('#desk-permission').click();
  await expect(page.locator('#desk-device')).toContainText('Synthetic camera');
  expect(
    await page.evaluate(() =>
      (window as unknown as { probeStreams: MediaStream[] }).probeStreams[0]!.getTracks().map(
        (t) => t.readyState,
      ),
    ),
  ).toEqual(['ended']);
  await page.locator('#desk-device').selectOption('synthetic-macbook-camera');
  await page.locator('#desk-start').click();
  await expect(page.locator('#desk-report')).toContainText('"clock": "unavailable"');
  await expect(page.locator('#desk-report')).toContainText('"plausibleBrowserCaptureTimes": 0');
  await expect(page.locator('#desk-report')).toContainText('"hands": 2');
  await openSettings(page);
  for (const point of Object.values(calibration().points)) {
    const canvas = page.locator('#overlay');
    const box = await canvas.boundingBox();
    await canvas.click({ position: { x: point.x * box!.width, y: point.y * box!.height } });
  }
  await resumePractice(page);
  const first = await page.locator('.passage > span').first().textContent();
  await page.locator('#typing').pressSequentially(first! + ' ');
  await expect(page.locator('#feedback')).toContainText('Word accepted. I could not verify');
  await expect(page.locator('#feedback')).toContainText(
    'Unknown observations are not finger mistakes',
  );
});

test('missing VideoFrame is a recoverable error before capture', async ({ page }) => {
  await syntheticCamera(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'VideoFrame', { value: undefined });
  });
  await page.goto('/?safariDeskView=1');
  await page.locator('#desk-refresh').click();
  await page.locator('#desk-device').selectOption('synthetic-macbook-camera');
  await page.locator('#desk-start').click();
  await expect(page.locator('#desk-report')).toContainText('This browser needs getUserMedia');
  await expect(page.locator('#desk-report')).toContainText('"status": "error"');
});

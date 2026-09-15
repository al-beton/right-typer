import { expect, test } from '@playwright/test';
import { syntheticCamera, setup, openSettings, press, resumePractice } from './helpers';
import { calibration } from '../tests/fixtures';

test('ordinary camera controls discover Desk View, attribute fingers, and retain separate camera maps on reload', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.addInitScript(() => {
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let permitted = false;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const requested =
        typeof constraints?.video === 'object'
          ? (constraints.video.deviceId as ConstrainDOMStringParameters)?.exact
          : '';
      window.__deviceId = requested === 'desk-view' ? 'desk-view' : 'synthetic-macbook-camera';
      const stream = await get({ audio: false, video: true });
      permitted = true;
      Object.defineProperty(stream.getVideoTracks()[0], 'label', {
        value: window.__deviceId === 'desk-view' ? 'Studio Display Desk View Camera' : 'Webcam',
      });
      return stream;
    };
    navigator.mediaDevices.enumerateDevices = async () =>
      permitted
        ? ([
            { kind: 'videoinput', deviceId: 'synthetic-macbook-camera', label: 'Webcam' },
            { kind: 'videoinput', deviceId: 'desk-view', label: 'Studio Display Desk View Camera' },
          ] as MediaDeviceInfo[])
        : [];
  });
  await setup(page);
  await openSettings(page);
  await expect(
    page.locator('#device option').filter({ hasText: 'Studio Display Desk View Camera' }),
  ).toHaveCount(1);
  await page.locator('#device').selectOption('desk-view');
  await expect(page.locator('#camera-badge')).toContainText('timing estimated');
  await expect(page.locator('.mapping-heading')).toContainText('0 /');
  for (const point of Object.values(calibration().points)) {
    const canvas = page.locator('#overlay');
    const box = await canvas.boundingBox();
    await canvas.click({ position: { x: point.x * box!.width, y: point.y * box!.height } });
  }
  await resumePractice(page);
  await press(page, 'c', 'right-index');
  await press(page, ' ', 'left-thumb');
  await expect(page.locator('#feedback')).toContainText('C: Wrong finger');
  await page.reload();
  await expect(page.locator('#camera-badge')).toContainText('timing estimated');
  await expect(page.locator('#typing')).toBeEnabled();
  await openSettings(page);
  await page.locator('#device').selectOption('synthetic-macbook-camera');
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await expect(page.locator('#camera-badge')).not.toContainText('timing estimated');
  await expect(page.locator('#settings-resume')).toBeEnabled();
  await page.screenshot({
    path: 'test-results/desk-view-source-controls-synthetic.png',
    fullPage: true,
  });
});

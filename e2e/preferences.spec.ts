import { test, expect } from '@playwright/test';
import { syntheticCamera, setup, openSettings, resumePractice, editSetup } from './helpers';

test('Go survives refresh; Pause and Edit setup remain paused; reset clears preferences', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  await openSettings(page, 'camera-group');
  await page.getByLabel('Rotate camera view').selectOption('270');
  await resumePractice(page);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect(page.locator('#typing')).toBeFocused();
  await expect(page.getByLabel('Rotate camera view')).toHaveValue('270');
  await expect(page.locator('#device')).toHaveValue('synthetic-macbook-camera');
  for (const action of ['Pause', 'Edit setup']) {
    if (action === 'Edit setup') await editSetup(page);
    else await page.getByRole('button', { name: action, exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: /^(Start|Resume) practice$/ })).toBeEnabled();
    await expect(page.locator('#typing')).toBeDisabled();
    await resumePractice(page);
  }
  await openSettings(page, 'about-group');
  await page.getByRole('button', { name: 'Reset local data' }).click();
  await page.getByRole('button', { name: 'Confirm reset' }).click();
  expect(await page.evaluate(() => localStorage.getItem('right-typer.v1'))).toBeNull();
  await page.reload();
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await expect(page.locator('#typing')).toBeDisabled();
  await expect(page.locator('.cal-key.mapped')).toHaveCount(0);
  await expect(page.getByLabel('Rotate camera view')).toHaveValue('0');
});

test('selected camera is requested after refresh and missing camera offers recovery', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = async () =>
      ['synthetic-macbook-camera', 'external-camera'].map(
        (deviceId) =>
          ({
            deviceId,
            kind: 'videoinput',
            label: deviceId,
            groupId: '',
            toJSON() {
              return {};
            },
          }) as MediaDeviceInfo,
      );
    navigator.mediaDevices.getUserMedia = (constraints) => {
      const video = constraints?.video;
      const id =
        video && typeof video === 'object'
          ? (video.deviceId as ConstrainDOMStringParameters)?.exact
          : undefined;
      sessionStorage.setItem('requested-camera', String(id ?? 'default'));
      if (id === 'external-camera') {
        if (sessionStorage.getItem('camera-missing'))
          return Promise.reject(
            new DOMException('Saved camera disconnected', 'OverconstrainedError'),
          );
        window.__deviceId = id;
        return original({
          ...constraints,
          video: { ...(video as MediaTrackConstraints), deviceId: undefined },
        });
      }
      window.__deviceId = 'synthetic-macbook-camera';
      return original(constraints);
    };
  });
  await setup(page);
  await editSetup(page);
  await openSettings(page, 'camera-group');
  await page.locator('#device').selectOption('external-camera');
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await expect(page.locator('.cal-key.mapped')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await expect(page.locator('#device')).toHaveValue('external-camera');
  expect(await page.evaluate(() => sessionStorage.getItem('requested-camera'))).toBe(
    'external-camera',
  );
  await expect(page.locator('#typing')).toBeDisabled();
  await page.evaluate(() => sessionStorage.setItem('camera-missing', 'true'));
  await page.reload();
  await expect(page.locator('#camera-badge')).toHaveText('Camera needs attention');
  await expect(page.locator('#device')).toBeEnabled();
  await openSettings(page, 'camera-group');
  await page.locator('#device').selectOption('synthetic-macbook-camera');
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await expect(page.getByRole('button', { name: /^(Start|Resume) practice$/ })).toBeEnabled();
});

test('legacy Go maps auto-start, but changed dimensions cannot auto-start', async ({ page }) => {
  await syntheticCamera(page);
  await setup(page);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('right-typer.v1')!);
    delete saved.practiceEnabled;
    delete saved.cameraDeviceId;
    localStorage.setItem('right-typer.v1', JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('right-typer.v1')!);
    saved.calibration.width += 10;
    localStorage.setItem('right-typer.v1', JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await expect(page.locator('#typing')).toBeDisabled();
  await expect(page.locator('.cal-key.mapped')).toHaveCount(0);
});

import { test, expect } from '@playwright/test';
import { syntheticCamera, setup, word } from './helpers';

test('disconnect cancels boundary grading, releases tracks and persists until reconnect', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__cameraRequests = 0;
    navigator.mediaDevices.getUserMedia = (c) => {
      window.__cameraRequests++;
      return original(c);
    };
  });
  await setup(page);
  await word(page, 'a');
  await expect(page.locator('.target-word')).toHaveText('quick');
  await page.getByLabel('Rotate camera view').selectOption('90');
  const stream = await page
    .locator('video')
    .evaluateHandle((v) => (v as HTMLVideoElement).srcObject as MediaStream);
  await page.evaluate(() => {
    window.__inferenceDelay = 2000;
  });
  await page.locator('#typing').pressSequentially('quick ');
  await expect(page.locator('#typing')).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Disconnect camera', exact: true }).click();
  await expect(page.locator('#camera-badge')).toHaveText('Camera disconnected');
  expect(await stream.evaluate((s) => s.getTracks().every((t) => t.readyState === 'ended'))).toBe(
    true,
  );
  expect(await page.evaluate(() => window.__terminated)).toBe(1);
  expect(await page.locator('video').evaluate((v) => (v as HTMLVideoElement).srcObject)).toBeNull();
  await page.waitForTimeout(2100);
  await expect(page.locator('#typing')).toBeDisabled();
  await expect(page.locator('.target-word')).toHaveText('quick');
  await page.getByRole('button', { name: 'Reconnect camera' }).click();
  await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.locator('#typing')).toHaveValue('');
  await expect(page.locator('.practice-metrics')).toContainText('1 /');
  await page.getByRole('button', { name: 'Disconnect camera', exact: true }).click();
  await page.reload();
  await expect(page.locator('#camera-badge')).toHaveText('Camera disconnected');
  expect(await page.evaluate(() => window.__cameraRequests)).toBe(0);
  await expect(page.getByLabel('Rotate camera view')).toHaveValue('90');
  await expect(page.locator('#device')).toHaveValue('synthetic-macbook-camera');
  await page.getByRole('button', { name: 'Reconnect camera' }).click();
  await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeEnabled();
  await expect(page.locator('.cal-key.mapped')).toHaveCount(30);
  await expect(page.locator('#typing')).toBeDisabled();
});

test('disconnect during pending permission stops a late stream and permits reconnect', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      const stream = await original(c);
      (window as unknown as { lateStream: MediaStream }).lateStream = stream;
      await new Promise((r) => setTimeout(r, 1500));
      return stream;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Disconnect camera', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { lateStream?: MediaStream }).lateStream
          ?.getTracks()
          .every((t) => t.readyState === 'ended'),
      ),
    )
    .toBe(true);
  await expect(page.locator('#camera-badge')).toHaveText('Camera disconnected');
  expect(await page.evaluate(() => window.__terminated)).toBe(0);
  await page.getByRole('button', { name: 'Reconnect camera' }).click();
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
});

test('disconnect while the model loads terminates it and ignores its late ready signal', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.addInitScript(() => {
    const Base = window.Worker;
    window.Worker = class extends Base {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
      }
      postMessage(message: unknown) {
        if ((message as { type: string }).type === 'init') {
          sessionStorage.setItem('model-loading', 'true');
          setTimeout(
            () => this.onmessage?.(new MessageEvent('message', { data: { type: 'ready' } })),
            1500,
          );
        } else super.postMessage(message);
      }
    };
  });
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('model-loading')))
    .toBe('true');
  await page.getByRole('button', { name: 'Disconnect camera', exact: true }).click();
  await page.waitForTimeout(1700);
  await expect(page.locator('#camera-badge')).toHaveText('Camera disconnected');
  expect(await page.evaluate(() => window.__terminated)).toBe(1);
});

test('reconnect retains partial mapping edits in this session', async ({ page }) => {
  await syntheticCamera(page);
  await page.goto('/');
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await page.locator('#overlay').click({ position: { x: 100, y: 100 } });
  await expect(page.locator('.cal-key.mapped')).toHaveCount(1);
  await page.getByRole('button', { name: 'Disconnect camera', exact: true }).click();
  await page.getByRole('button', { name: 'Reconnect camera' }).click();
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await expect(page.locator('.cal-key.mapped')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeDisabled();
});

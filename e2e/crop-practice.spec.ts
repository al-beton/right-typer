import { expect, test, type Page } from '@playwright/test';
import { syntheticCamera, setup, openSettings, resumePractice, press } from './helpers';
import { calibration } from '../tests/fixtures';
import type { SeenHand } from '../src/core/types';

async function croppedSyntheticCamera(page: Page) {
  await syntheticCamera(page);
  await page.addInitScript(() => {
    const Base = window.Worker;
    class CroppedWorker {
      inner = new Base('');
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      crops = new Map<number, { x: number; y: number; width: number; height: number }>();
      constructor() {
        this.inner.onmessage = (event) => {
          const data = event.data;
          const crop = this.crops.get(data.id);
          if (data.type === 'frame' && crop) {
            data.hands = data.hands.map((hand: SeenHand) => ({
              ...hand,
              points: hand.points.map((p) => ({
                ...p,
                x: (p.x - crop.x) / crop.width,
                y: (p.y - crop.y) / crop.height,
              })),
            }));
            this.crops.delete(data.id);
          }
          this.onmessage?.(new MessageEvent('message', { data }));
        };
      }
      postMessage(message: { type: string; id?: number; bitmap?: ImageBitmap }) {
        if (message.type === 'frame') {
          const selected = document.getElementById('crop-selection')!.style;
          this.crops.set(message.id!, {
            x: parseFloat(selected.left) / 100 || 0,
            y: parseFloat(selected.top) / 100 || 0,
            width: parseFloat(selected.width) / 100 || 1,
            height: parseFloat(selected.height) / 100 || 1,
          });
          (window as unknown as { cropBitmap: number[] }).cropBitmap = [
            message.bitmap!.width,
            message.bitmap!.height,
          ];
        }
        this.inner.postMessage(message);
      }
      terminate() {
        this.inner.terminate();
      }
    }
    window.Worker = CroppedWorker as unknown as typeof Worker;
  });
}
async function chooseCrop(page: Page) {
  await page.locator('#crop-view').click();
  await page.locator('#crop-width').fill('90');
  await page.locator('#crop-left').fill('5');
  await page.locator('#crop-height').fill('70');
  await page.locator('#crop-top').fill('25');
}

test('full app crops actual inference, keeps calibration aligned and grades observed fingers after resume/reload', async ({
  page,
}) => {
  await croppedSyntheticCamera(page);
  await setup(page);
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration.points,
  );
  await chooseCrop(page);
  await expect(page.locator('#crop-description')).toContainText('Cropped');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { cropBitmap: number[] }).cropBitmap))
    .toEqual([864, 504]);
  await expect(page.locator('#settings-resume')).toBeEnabled();
  await resumePractice(page);
  await expect(page.locator('#typing')).toBeEnabled();
  await press(page, 'c', 'right-index');
  await press(page, ' ', 'left-thumb');
  await expect(page.locator('#feedback')).toContainText('For c, I saw right index');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration.points,
    ),
  ).toEqual(before);
  await page.reload();
  await expect(page.locator('#typing')).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { cropBitmap: number[] }).cropBitmap))
    .toEqual([864, 504]);
  await page.locator('#crop-view').click();
  await page.locator('#crop-width').fill('30');
  await expect(page.locator('#settings-resume')).toBeDisabled();
  await expect(page.locator('#setup-message')).toContainText('hides mapped keys');
  await page.locator('#crop-reset').click();
  await expect(page.locator('#settings-resume')).toBeEnabled();
  await resumePractice(page);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { cropBitmap: number[] }).cropBitmap))
    .toEqual([960, 720]);
});

test('calibration clicks in a cropped rotated view retain source positions and survive reconnect', async ({
  page,
}) => {
  await croppedSyntheticCamera(page);
  await setup(page);
  await chooseCrop(page);
  await page.locator('#camera-rotation').selectOption('90');
  await page.locator('#edit-map').click();
  await page.locator('#remap').click();
  await page.locator('#view-wrap').scrollIntoViewIfNeeded();
  for (const point of Object.values(calibration().points)) {
    const box = (await page.locator('#overlay').boundingBox())!;
    await page.mouse.click(box.x + (1 - point.y) * box.width, box.y + point.x * box.height);
  }
  await expect(page.locator('#settings-resume')).toBeEnabled();
  await resumePractice(page);
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration.points,
  );
  const expectedPoints = Object.values(calibration().points);
  expect(Object.keys(stored)).toHaveLength(expectedPoints.length);
  Object.values(stored as Record<string, { x: number; y: number }>).forEach((point, i) => {
    expect(point.x).toBeCloseTo(expectedPoints[i]!.x, 2);
    expect(point.y).toBeCloseTo(expectedPoints[i]!.y, 2);
  });
  await openSettings(page);
  await page.locator('#disconnect-camera').click();
  await page.locator('#start-camera').click();
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await expect(page.locator('#settings-resume')).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { cropBitmap: number[] }).cropBitmap))
    .toEqual([864, 504]);
  await page.evaluate(() => {
    window.__deviceId = 'another-camera';
  });
  await page.locator('#device').selectOption('');
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await expect(page.locator('#crop-description')).toContainText('Full frame');
  await expect(page.locator('#settings-resume')).toBeDisabled();
  await page.evaluate(() => {
    window.__deviceId = 'synthetic-macbook-camera';
  });
  await page.locator('#device').selectOption('');
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await expect(page.locator('#crop-description')).toContainText('Cropped');
  await expect(page.locator('#settings-resume')).toBeEnabled();
});

test('real model and cropped full app run on synthetic media with no external requests', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (request) => requests.push(request.url()));
  await page.addInitScript(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d')!;
    const draw = () => {
      context.fillStyle = '#315944';
      context.fillRect(0, 0, 640, 480);
      context.fillStyle = '#00ff00';
      context.fillRect(32, 120, 576, 336);
      context.fillStyle = 'white';
      context.font = '24px system-ui';
      context.fillText('SYNTHETIC CAMERA', 140, 220);
      requestAnimationFrame(draw);
    };
    draw();
    navigator.mediaDevices.getUserMedia = async () => {
      const stream = canvas.captureStream(30);
      const track = stream.getVideoTracks()[0]!;
      Object.defineProperty(track, 'label', { value: 'Synthetic Desk View' });
      const getSettings = track.getSettings.bind(track);
      track.getSettings = () => ({ ...getSettings(), deviceId: 'synthetic-desk' });
      return stream;
    };
    navigator.mediaDevices.enumerateDevices = async () => [];
    const RealWorker = window.Worker;
    window.Worker = class extends RealWorker {
      postMessage(
        message: { type: string; bitmap?: ImageBitmap },
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (message.type === 'frame' && message.bitmap) {
          const bitmap = message.bitmap;
          const probe = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = probe.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          (window as unknown as { inputPixels: number[][] }).inputPixels = [
            [5, 5],
            [bitmap.width - 6, 5],
            [5, bitmap.height - 6],
            [bitmap.width - 6, bitmap.height - 6],
          ].map(([x, y]) => Array.from(ctx.getImageData(x!, y!, 1, 1).data));
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.goto('/');
  if (browserName === 'webkit') {
    // Synthetic canvas streams have no camera grant to exempt Safari autoplay.
    await openSettings(page);
    await page.locator('#start-camera').click();
    await page.locator('#settings-close').click();
  }
  await expect(page.locator('#camera-badge'))
    .toContainText('0 hands detected')
    .catch(async () => {
      throw new Error(await page.locator('main').innerText());
    });
  await chooseCrop(page);
  // Check actual inference pixels, not just the returned bitmap's dimensions.
  // WebKit can resize the full VideoFrame instead of honoring a source crop.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { inputPixels: number[][] }).inputPixels))
    .toEqual(Array.from({ length: 4 }, () => [0, 255, 0, 255]));
  await page.locator('#crop-done').click();
  await page.locator('#view-wrap').scrollIntoViewIfNeeded();
  for (const point of Object.values(calibration().points)) {
    const box = (await page.locator('#overlay').boundingBox())!;
    await page.mouse.click(box.x + point.x * box.width, box.y + point.y * box.height);
  }
  await expect(page.locator('#settings-resume')).toBeEnabled();
  await resumePractice(page);
  await expect(page.locator('#typing')).toBeEnabled();
  const word = (await page.locator('#current-target').innerText()).trim();
  await page.locator('#typing').pressSequentially(word, { delay: 80 });
  await page.locator('#typing').press('Space');
  await expect(page.locator('#current-target')).not.toHaveText(word);
  // The normal practice camera fills the keyboard/content width and preserves
  // the complete crop, including after a settings round trip and view rotation.
  for (const width of [1440, 640, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(async () => {
        const view = (await page.locator('#view-wrap').boundingBox())!;
        const keyboard = (await page.locator('#finger-map').boundingBox())!;
        return Math.abs(view.width - keyboard.width);
      })
      .toBeLessThan(1);
    const view = (await page.locator('#view-wrap').boundingBox())!;
    expect(view.width / view.height).toBeCloseTo(((640 / 480) * 0.9) / 0.7, 2);
    const image = (await page.locator('#camera-image').boundingBox())!;
    expect(Math.abs(image.width - view.width)).toBeLessThan(1);
    expect(Math.abs(image.height - view.height)).toBeLessThan(1);
    expect(await page.locator('#camera').boundingBox()).toEqual(
      await page.locator('#overlay').boundingBox(),
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/live-view-${browserName}-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openSettings(page);
  await page.getByLabel('Rotate camera view').selectOption('90');
  await resumePractice(page);
  await expect(page.locator('#typing')).toBeEnabled();
  await expect
    .poll(async () => {
      const box = (await page.locator('#view-wrap').boundingBox())!;
      return box.width / box.height;
    })
    .toBeCloseTo(1 / (((640 / 480) * 0.9) / 0.7), 2);
  expect(await page.locator('#camera').boundingBox()).toEqual(
    await page.locator('#overlay').boundingBox(),
  );
  await page.screenshot({
    path: `test-results/live-view-${browserName}-rotated.png`,
    fullPage: true,
  });
  await page.locator('#crop-view').click();
  await page.screenshot({
    path: `test-results/live-view-${browserName}-settings.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(requests.filter((url) => new URL(url).origin !== new URL(page.url()).origin)).toEqual([]);
  await page.locator('#disconnect-camera').click();
});

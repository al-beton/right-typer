import { expect, test, type Page } from '@playwright/test';
import { syntheticCamera, openSettings, setup } from './helpers';
import { calibration } from '../tests/fixtures';

declare global {
  interface Window {
    __displayRequests: number;
    __displayOptions?: DisplayMediaStreamOptions;
    __displayStream?: MediaStream;
    __cancelDisplay: boolean;
  }
}
async function displayInput(page: Page, realModel = false) {
  if (!realModel) await syntheticCamera(page);
  await page.addInitScript(() => {
    window.__displayRequests = 0;
    window.__cancelDisplay = false;
    navigator.mediaDevices.getDisplayMedia = async (options) => {
      window.__displayRequests++;
      window.__displayOptions = options;
      if (window.__cancelDisplay) throw new DOMException('cancelled', 'NotAllowedError');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      window.__displayStream = stream;
      return stream;
    };
  });
  await page.goto('/?input=window');
}
async function map(page: Page) {
  for (const point of Object.values(calibration().points)) {
    const canvas = page.locator('#overlay');
    const box = await canvas.boundingBox();
    await canvas.click({ position: { x: point.x * box!.width, y: point.y * box!.height } });
  }
}

test('window input maps, feeds the worker, advances words as unknown, stops and requires a fresh map', async ({
  page,
}) => {
  await displayInput(page);
  expect(await page.evaluate(() => window.__displayRequests)).toBe(0);
  await page.locator('#share-window').click();
  await expect(page.locator('#camera-badge')).toContainText('hands · window timing unknown');
  expect(await page.evaluate(() => window.__displayOptions?.audio)).toBe(false);
  await map(page);
  await page.locator('#settings-resume').click();
  const words = await page.locator('.passage > span').allTextContents();
  await page.locator('#typing').pressSequentially(words[0]!);
  await page.locator('#typing').press('Space');
  await expect(page.locator('.passage .active')).toHaveText(words[1]!);
  await expect(page.locator('#feedback')).toContainText('could not verify');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration),
  ).toBeUndefined();
  await openSettings(page);
  await page.locator('#disconnect-camera').click();
  expect(await page.evaluate(() => window.__displayStream?.getVideoTracks()[0]?.readyState)).toBe(
    'ended',
  );
  await page.locator('#share-window').click();
  await expect(page.locator('#camera-badge')).toContainText('window timing unknown');
  await expect(page.locator('.mapping-heading')).toContainText('0 /');
  await expect(page.locator('#settings-resume')).toBeDisabled();
  expect(await page.evaluate(() => window.__displayRequests)).toBe(2);
});

test('picker cancellation and browser stop recover without opening another source', async ({
  page,
}) => {
  await displayInput(page);
  await page.evaluate(() => {
    window.__cancelDisplay = true;
  });
  await page.locator('#share-window').click();
  await expect(page.locator('#setup-message')).toContainText('cancelled or denied');
  await expect(page.locator('#share-window')).toBeEnabled();
  await page.evaluate(() => {
    window.__cancelDisplay = false;
  });
  await page.locator('#share-window').click();
  await expect(page.locator('#camera-badge')).toContainText('window timing unknown');
  await page.evaluate(() =>
    window.__displayStream!.getVideoTracks()[0]!.dispatchEvent(new Event('ended')),
  );
  await expect(page.locator('#setup-message')).toContainText('Window sharing ended');
  expect(
    await page.evaluate(() =>
      window.__displayStream!.getTracks().every((t) => t.readyState === 'ended'),
    ),
  ).toBe(true);
});

test('real bundled model consumes synthetic display pixels with local requests and honest timing', async ({
  page,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!r.url().startsWith(new URL(page.url()).origin + '/') && !r.url().startsWith('data:'))
      external.push(r.url());
  });
  await displayInput(page, true);
  await page.locator('#share-window').click();
  await expect(page.locator('#camera-badge')).toContainText('0 hands · window timing unknown', {
    timeout: 30000,
  });
  await page.locator('#window-diagnostics > summary').click();
  await expect(page.locator('#window-readout')).toContainText('model results');
  await expect(page.locator('#window-readout')).toContainText('audio tracks 0');
  await page.screenshot({ path: 'test-results/window-real-model-synthetic.png', fullPage: true });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('resizing a shared stream invalidates mapping and pauses typing', async ({ page }) => {
  await displayInput(page);
  await page.locator('#share-window').click();
  await expect(page.locator('#camera-badge')).toContainText('window timing unknown');
  await map(page);
  await page.locator('#settings-resume').click();
  await page.evaluate(async () => {
    await window
      .__displayStream!.getVideoTracks()[0]!
      .applyConstraints({ width: 800, height: 600 });
  });
  await expect(page.locator('#typing')).toBeDisabled();
  await openSettings(page);
  await expect(page.locator('.mapping-heading')).toContainText('0 /');
  await expect(page.locator('#settings-resume')).toBeDisabled();
});

test('window practice preserves the saved webcam map and webcam reconnect reuses it', async ({
  page,
}) => {
  await displayInput(page);
  await setup(page);
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration,
  );
  await openSettings(page);
  await page.locator('#share-window').click();
  await expect(page.locator('#camera-badge')).toContainText('window timing unknown');
  await map(page);
  await page.locator('#settings-resume').click();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration),
  ).toEqual(saved);
  await openSettings(page);
  await page.locator('#start-camera').click();
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await expect(page.locator('#settings-resume')).toBeEnabled();
});

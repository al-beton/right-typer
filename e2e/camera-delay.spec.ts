import { expect, test, type Page } from '@playwright/test';
import { openSettings, resumePractice, setup, syntheticCamera } from './helpers';

declare global {
  interface Window {
    __callbackBasis: boolean;
    __clipRawAt?: number;
  }
}
async function desk(page: Page) {
  await syntheticCamera(page, undefined, true);
  await page.addInitScript(() => {
    window.__callbackBasis = false;
    const callback = HTMLVideoElement.prototype.requestVideoFrameCallback;
    HTMLVideoElement.prototype.requestVideoFrameCallback = function (fn) {
      return callback.call(this, (now, meta) =>
        fn(now, {
          ...meta,
          captureTime: window.__callbackBasis
            ? undefined
            : (window.__clipRawAt ?? performance.now() - 5),
        }),
      );
    };
  });
}
async function apply(page: Page, value: string) {
  await page.locator('#camera-delay').fill(value);
  await page.locator('#apply-camera-delay').click();
  await expect(page.locator('#camera-delay-status')).toContainText(`Applied: ${value} ms`);
}

test('same clip aligns actual red/green pixels at 0/50 ms and supports replay and saving', async ({
  page,
}) => {
  await desk(page);
  await setup(page, false, '/', test.info().project.name === 'webkit');
  await openSettings(page);
  const before = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('right-typer.v1')!);
    return {
      points: data.calibration.points,
      results: data.results,
      progress: Object.fromEntries(
        Object.entries(localStorage).filter(([k]) => k !== 'right-typer.v1'),
      ),
    };
  });
  await page.locator('#record-delay-clip').click();
  await page.evaluate(() => {
    window.__clipPixel = '#ff0000';
  });
  await page.waitForTimeout(100);
  const base = await page.evaluate(() => {
    const at = performance.now();
    window.__clipRawAt = at;
    return at;
  });
  await page.waitForTimeout(150);
  await page.locator('#delay-clip-keys').evaluate((el, at) => {
    const event = new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', bubbles: true });
    Object.defineProperty(event, 'timeStamp', { value: at });
    el.dispatchEvent(event);
  }, base);
  await page.evaluate(() => {
    window.__clipPixel = '#00ff00';
  });
  await page.waitForTimeout(100);
  await page.evaluate((at) => {
    window.__clipRawAt = at + 50;
  }, base);
  await page.waitForTimeout(150);
  await page.locator('#stop-delay-clip').click();
  await expect(page.locator('#delay-clip-review')).toBeVisible();
  await page.locator('#clip-markers button').click();
  const layout = await page.locator('#delay-clip-view').evaluate((el) => {
    const box = el.getBoundingClientRect();
    const parent = el.parentElement!.getBoundingClientRect();
    return { width: box.width, height: box.height, top: box.top - parent.top };
  });
  expect(layout.width).toBeGreaterThan(450);
  expect(layout.height).toBeGreaterThan(200);
  expect(Math.abs(layout.top)).toBeLessThan(2);
  const pixel = () =>
    page
      .locator('#delay-clip-view')
      .evaluate((c) =>
        Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(1, 1, 1, 1).data).slice(
          0,
          3,
        ),
      );
  await expect
    .poll(async () => {
      const p = await pixel();
      return p[0]! > 240 && p[1]! < 10 && p[2]! < 10;
    })
    .toBe(true);
  await page.locator('#camera-delay').fill('50');
  await expect
    .poll(async () => {
      const p = await pixel();
      return p[0]! < 10 && p[1]! > 240 && p[2]! < 10;
    })
    .toBe(true);
  await expect(page.locator('#delay-clip-position')).toContainText('frame − key after delay: 0 ms');
  await expect(page.locator('#camera-delay-status')).toContainText('Applied value remains 0');
  const selected = await page.locator('#delay-clip-view').getAttribute('data-frame-id');
  await page.locator('#clip-prev').click();
  await expect(page.locator('#delay-clip-view')).not.toHaveAttribute('data-frame-id', selected!);
  await page.locator('#clip-next').click();
  await expect(page.locator('#delay-clip-view')).toHaveAttribute('data-frame-id', selected!);
  await page.locator('#clip-scrub').fill('0');
  await page.locator('#clip-speed').selectOption('0.25');
  await page.locator('#clip-play').click();
  await expect(page.locator('#clip-play')).toHaveText('Pause');
  await page.locator('#clip-play').click();
  await page.locator('#clip-markers button').click();
  await page.locator('#apply-camera-delay').click();
  await expect(page.locator('#camera-delay')).toHaveValue('50');
  await expect(page.locator('#delay-clip-review')).toBeVisible();
  await expect
    .poll(async () => {
      const p = await pixel();
      return p[0]! < 10 && p[1]! > 240 && p[2]! < 10;
    })
    .toBe(true);
  const after = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('right-typer.v1')!);
    return {
      points: data.calibration.points,
      results: data.results,
      progress: Object.fromEntries(
        Object.entries(localStorage).filter(([k]) => k !== 'right-typer.v1'),
      ),
    };
  });
  expect(after).toEqual(before);
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.locator('#camera-delay-controls').scrollIntoViewIfNeeded();
  await page
    .locator('#camera-delay-controls')
    .screenshot({ path: `test-results/clip-${test.info().project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#discard-delay-clip').click();
  await expect(page.locator('#delay-clip-review')).toBeHidden();
  await expect(page.locator('#clip-markers button')).toHaveCount(0);
  await page.evaluate(() => {
    window.__clipRawAt = undefined;
  });
  await resumePractice(page);
  await page.reload();
  if (test.info().project.name === 'webkit') {
    await openSettings(page);
    await page.locator('#start-camera').click();
  }
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await openSettings(page);
  await expect(page.locator('#camera-delay')).toHaveValue('50');
  await expect(page.locator('#delay-clip-review')).toBeHidden();
});

test('basis and source changes create zero-delay epochs; window reuse is explicit', async ({
  page,
}) => {
  await desk(page);
  await setup(page, false, '/', test.info().project.name === 'webkit');
  await openSettings(page);
  await apply(page, '50');
  await page.locator('#record-delay-clip').click();
  await page.locator('#delay-clip-keys').press('r');
  await page.waitForTimeout(150);
  await page.locator('#stop-delay-clip').click();
  await expect(page.locator('#delay-clip-review')).toBeVisible();
  await page.evaluate(() => {
    window.__callbackBasis = true;
  });
  await expect(page.locator('#camera-delay')).toHaveValue('0');
  await expect(page.locator('#camera-delay-status')).toContainText('timing changed');
  await expect(page.locator('#delay-clip-review')).toBeHidden();
  await expect(page.locator('#clip-markers button')).toHaveCount(0);
  await apply(page, '75');
  await page.evaluate(() => {
    window.__callbackBasis = false;
  });
  await expect(page.locator('#camera-delay')).toHaveValue('0');
  await page.evaluate(() => {
    window.__deviceId = 'second-camera';
  });
  await expect(page.locator('#camera-delay')).toHaveValue('0');
  await page.locator('#share-window').click();
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await apply(page, '50');
  await page.locator('#share-window').click();
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await expect(page.locator('#camera-delay')).toHaveValue('0');
  await page.locator('#reuse-camera-delay').click();
  await expect(page.locator('#camera-delay')).toHaveValue('50');
});

test('retake, cancel, duration and geometry invalidation discard local clip data', async ({
  page,
}) => {
  await desk(page);
  await setup(page, false, '/', test.info().project.name === 'webkit');
  await openSettings(page);
  await page.locator('#record-delay-clip').click();
  await page
    .locator('#camera-delay')
    .evaluate((el) =>
      el.dispatchEvent(new KeyboardEvent('keydown', { key: '5', code: 'Digit5', bubbles: true })),
    );
  await page.locator('#delay-clip-keys').press('f');
  await expect(page.locator('#stop-delay-clip')).toBeHidden({ timeout: 7000 });
  await expect(page.locator('#delay-clip-review')).toBeVisible();
  await expect(page.locator('#clip-markers button')).toHaveCount(1);
  await page.locator('#retake-delay-clip').click();
  await expect(page.locator('#clip-markers button')).toHaveCount(0);
  await page.waitForTimeout(100);
  await page.locator('#stop-delay-clip').click();
  await expect(page.locator('#delay-clip-review')).toBeVisible();
  await page.locator('#camera-delay').fill('50');
  await page.locator('#camera-rotation').selectOption('90');
  await expect(page.locator('#delay-clip-review')).toBeHidden();
  await expect(page.locator('#camera-delay')).toHaveValue('0');
  await page.locator('#record-delay-clip').click();
  await page.locator('#cancel-camera-delay').click();
  await expect(page.locator('#stop-delay-clip')).toBeHidden();
  await expect(page.locator('#clip-markers button')).toHaveCount(0);
});

import { expect, test, type Page } from '@playwright/test';
import { openSettings, resumePractice, setup, syntheticCamera } from './helpers';
import { handsAt } from '../tests/fixtures';

declare global {
  interface Window {
    __callbackBasis: boolean;
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
          captureTime: window.__callbackBasis ? undefined : performance.now() - 5,
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

test('save/check/reset keeps mapping and practice data intact; wrong-finger control stays observed', async ({
  page,
}) => {
  await desk(page);
  await setup(page, false, '/', test.info().project.name === 'webkit');
  await openSettings(page);
  const persisted = () =>
    page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('right-typer.v1')!);
      return {
        points: data.calibration.points,
        results: data.results,
        progress: Object.fromEntries(
          Object.entries(localStorage).filter(([k]) => k !== 'right-typer.v1'),
        ),
      };
    });
  const before = await persisted();
  await apply(page, '50');
  await page.locator('#camera-delay-controls summary').click();
  await page.locator('#delay-check-mode').selectOption('wrong');
  await page.locator('#repeat-delay-check').click();
  await page.evaluate(
    (hands) => {
      window.__hands = hands;
    },
    handsAt('r', 'left-middle'),
  );
  await page.waitForTimeout(150);
  await page.locator('#delay-check-input').press('r');
  await expect(page.locator('#delay-check-results')).toContainText('Camera: left middle');
  await expect(page.locator('#delay-check-results')).toContainText('extra delay 50 ms');
  for (const [mode, keys] of [
    ['fr', 'fr'],
    ['er', 'er'],
    ['slow', 'frer'],
  ]) {
    await page.locator('#delay-check-mode').selectOption(mode!);
    await page.locator('#repeat-delay-check').click();
    for (const key of keys!) {
      await page.evaluate(
        (hands) => {
          window.__hands = hands;
        },
        handsAt(key, key === 'e' ? 'left-middle' : 'left-index'),
      );
      await page.waitForTimeout(100);
      await page.locator('#delay-check-input').press(key);
    }
    await expect(page.locator('#delay-check-results li')).toHaveCount(keys!.length);
    await expect(page.locator('#delay-check-results')).not.toContainText('waiting');
    await expect(page.locator('#delay-check-results')).not.toContainText('unknown');
  }
  expect(await persisted()).toEqual(before);
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.locator('#camera-delay-controls').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({
    path: `test-results/delay-${test.info().project.name}.png`,
    animations: 'disabled',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await resumePractice(page);
  await page.reload();
  if (test.info().project.name === 'webkit') {
    await openSettings(page);
    await page.locator('#start-camera').click();
  }
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await openSettings(page);
  await expect(page.locator('#camera-delay')).toHaveValue('50');
  expect((await persisted()).points).toEqual(before.points);
  await page.locator('#reset-camera-delay').click();
  await expect(page.locator('#camera-delay')).toHaveValue('0');
});

test('basis and source changes create zero-delay epochs; window reuse is explicit', async ({
  page,
}) => {
  await desk(page);
  await setup(page, false, '/', test.info().project.name === 'webkit');
  await openSettings(page);
  await apply(page, '50');
  await page.evaluate(() => {
    window.__callbackBasis = true;
  });
  await expect(page.locator('#camera-delay')).toHaveValue('0');
  await expect(page.locator('#camera-delay-status')).toContainText('timing changed');
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

test('applying during a delayed check clears pending results and starts a fresh check', async ({
  page,
}) => {
  await desk(page);
  await setup(page, false, '/', test.info().project.name === 'webkit');
  await openSettings(page);
  await page.locator('#camera-delay-controls summary').click();
  await page.locator('#delay-check-mode').selectOption('wrong');
  await page.evaluate(() => {
    window.__inferenceDelay = 1400;
  });
  await page.waitForTimeout(120);
  await page.locator('#repeat-delay-check').click();
  await page.locator('#delay-check-input').press('r');
  await apply(page, '50');
  await page.waitForTimeout(1600);
  await expect(page.locator('#delay-check-results li')).toHaveCount(0);
  await page.evaluate(() => {
    window.__inferenceDelay = 12;
  });
  await page.locator('#repeat-delay-check').click();
  await page.locator('#delay-check-input').press('r');
  await expect(page.locator('#delay-check-results li')).toHaveCount(1);
  await expect(page.locator('#delay-check-results')).not.toContainText('waiting');
});

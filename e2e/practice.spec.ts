import { test, expect } from '@playwright/test';
import { syntheticCamera, setup, press, word } from './helpers';
import { WORDS } from '../src/passage';

test('complete guided setup, a whole correctly observed passage, results, restart and persistence', async ({
  page,
}) => {
  test.setTimeout(150000);
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4173/')) external.push(r.url());
  });
  await syntheticCamera(page);
  await setup(page);
  for (let i = 0; i < WORDS.length; i++) {
    await expect(page.locator('.target-word')).toHaveText(WORDS[i]!);
    await word(page, WORDS[i]!);
    if (i < WORDS.length - 1) await expect(page.locator('.target-word')).toHaveText(WORDS[i + 1]!);
    if (i === 7)
      await page.screenshot({ path: 'test-results/practice-synthetic.png', fullPage: true });
  }
  await expect(page.getByText('PASSAGE COMPLETE', { exact: true })).toBeVisible();
  await expect(page.locator('.result-note')).toContainText('0 retries');
  await expect(page.locator('.result-grid')).toContainText('0wrong-finger presses');
  expect(await page.evaluate(() => window.__terminated)).toBeGreaterThan(0);
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!));
  expect(persisted.results).toHaveLength(1);
  expect(persisted.results[0].uncertaintyRetries).toBe(0);
  expect(persisted.results[0].passedWords).toBe(WORDS.length);
  await page.screenshot({ path: 'test-results/results-synthetic.png', fullPage: true });
  await page.getByRole('button', { name: 'Practise again' }).click();
  await expect(page.locator('#camera-badge')).toHaveText('Camera off');
  await expect(page.locator('#camera-empty')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Your keyboard. From a new perspective.' }),
  ).toBeVisible();
  await setup(page, true);
  await expect(page.locator('.target-word')).toHaveText('a');
  await page.getByRole('button', { name: 'Reset local data' }).click();
  await page.getByRole('button', { name: 'Confirm reset' }).click();
  expect(await page.evaluate(() => localStorage.getItem('right-typer.v1'))).toBeNull();
  expect(external).toEqual([]);
});

test('wrong finger, erased wrong finger, ambiguous evidence, repair guidance and fresh retries', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  await press(page, 'a', 'left-index');
  await expect(page.locator('#feedback')).not.toContainText('another go');
  await page.locator('#typing').press('Backspace');
  await press(page, 'a');
  await press(page, ' ');
  await expect(page.locator('#feedback')).toContainText('saw left index');
  await expect(page.locator('.target-word')).toHaveText('a');
  await page.screenshot({ path: 'test-results/wrong-finger-synthetic.png', fullPage: true });
  await page.locator('#typing').press('Enter');
  await expect(page.locator('#typing')).toHaveValue('');
  for (let i = 0; i < 2; i++) {
    await press(page, 'a', undefined, true);
    await press(page, ' ', undefined, true);
    await expect(page.locator('#feedback')).toContainText(
      'camera uncertainty, not a finger mistake',
    );
    if (i === 0) await page.getByRole('button', { name: 'Try this word again' }).click();
  }
  await expect(page.locator('.recovery')).toContainText('Uncertainty is repeating');
  await page.getByRole('button', { name: 'Fix camera setup' }).click();
  await expect(page.getByRole('button', { name: 'Check saved key positions' })).toBeVisible();
  await page.getByRole('button', { name: 'Check saved key positions' }).click();
  await expect(page.getByRole('button', { name: 'Return to this word' })).toBeDisabled();
  // Restore hands by using the helper while on the diagnostic view through a direct fixture assignment.
  const { handsAt } = await import('../tests/fixtures');
  await page.evaluate(
    (h) => {
      window.__hands = h;
    },
    handsAt('f', 'left-index'),
  );
  await page.locator('#alignment').check();
  await page.locator('#identity').check();
  await page.getByRole('button', { name: 'Return to this word' }).click();
  await word(page, 'a');
  await expect(page.locator('.target-word')).toHaveText('quick');
});

test('boundary wait owns input; pause resumes the same word and pasted text cannot advance', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  await press(page, 'a');
  await page.evaluate(() => {
    window.__inferenceDelay = 550;
  });
  await press(page, ' ');
  await expect(page.locator('#feedback')).toContainText('Matching camera evidence');
  await page.locator('#typing').press('x');
  await expect(page.locator('#input-message')).toContainText('not entered while checking');
  // Slow observation may be uncertain, but must never leak x into any attempt.
  await expect(page.locator('#feedback')).not.toContainText('Matching camera evidence', {
    timeout: 5000,
  });
  await expect(page.locator('#typing')).not.toHaveValue('x');
  await page.evaluate(() => {
    window.__inferenceDelay = 12;
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('#alignment')).not.toBeChecked();
  await page.locator('#alignment').check();
  await page.locator('#identity').check();
  await page.getByRole('button', { name: 'Return to this word' }).click();
  await page.locator('#typing').dispatchEvent('paste');
  await expect(page.locator('#typing')).toHaveValue('');
  await expect(page.locator('#input-message')).toContainText('Pasting is not graded');
});

test('permission denial is actionable and blocks calibration', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up your camera' }).click();
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await expect(page.locator('#setup-message')).toContainText('Camera permission is blocked');
  await expect(page.getByRole('button', { name: 'Map the key positions' })).toBeDisabled();
});

test('saved calibration survives a reload with the same camera', async ({ page }) => {
  await syntheticCamera(page);
  await setup(page);
  const previous = await page.evaluate(
    () => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration,
  );
  await page.reload();
  await page.getByRole('button', { name: 'Set up your camera' }).click();
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await expect(page.locator('#camera-badge')).toContainText('Both hands');
  const current = await page.locator('video').evaluate((v) => ({
    ...((v as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0]!.getSettings(),
    actualWidth: (v as HTMLVideoElement).videoWidth,
    actualHeight: (v as HTMLVideoElement).videoHeight,
  }));
  expect(current.deviceId, JSON.stringify({ previousDevice: previous.deviceId, current })).toBe(
    previous.deviceId,
  );
  expect(current.actualWidth).toBe(previous.width);
  await expect(page.getByRole('button', { name: 'Check saved key positions' })).toBeVisible();
});

test('changed camera identity requires remapping', async ({ page }) => {
  await syntheticCamera(page);
  await setup(page);
  await page.getByRole('button', { name: 'Fix camera setup' }).click();
  await page.evaluate(() => {
    window.__deviceId = 'different-camera';
  });
  await page.getByRole('button', { name: 'Restart camera' }).click();
  await expect(page.getByRole('button', { name: 'Map the key positions' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Check saved key positions' })).toHaveCount(0);
});

test('missing capture timestamps keep practice blocked with an explanation', async ({ page }) => {
  await syntheticCamera(page);
  await page.addInitScript(() => {
    const nativeCallback = HTMLVideoElement.prototype.requestVideoFrameCallback;
    HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) {
      return nativeCallback.call(this, (now, metadata) => {
        delete metadata.captureTime;
        callback(now, metadata);
      });
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up your camera' }).click();
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await expect(page.locator('#camera-badge')).toContainText('Capture timing unavailable');
  await page.getByRole('button', { name: 'Map the key positions' }).click();
  const { calibration } = await import('../tests/fixtures');
  for (const p of Object.values(calibration().points)) {
    const c = page.locator('#overlay'),
      b = await c.boundingBox();
    await c.click({ position: { x: p.x * b!.width, y: p.y * b!.height } });
  }
  await page.getByRole('button', { name: 'Check alignment' }).click();
  await page.locator('#alignment').check();
  await page.locator('#identity').check();
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeDisabled();
  await expect(page.locator('#ready-message')).toContainText(
    'not exposing camera capture timestamps',
  );
});

test('worker failure releases the stream and returns to camera recovery', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      onmessage: ((e: MessageEvent) => void) | null = null;
      postMessage() {
        setTimeout(
          () =>
            this.onmessage?.(
              new MessageEvent('message', {
                data: { type: 'error', message: 'Test: model asset unavailable' },
              }),
            ),
          10,
        );
      }
      terminate() {}
    } as unknown as typeof Worker;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up your camera' }).click();
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await expect(page.locator('#setup-message')).toContainText('model asset unavailable');
  expect(await page.locator('video').evaluate((v) => (v as HTMLVideoElement).srcObject)).toBeNull();
  await expect(page.getByRole('button', { name: 'Enable camera' })).toBeEnabled();
});

test('blocked persistence is visible while practice still works', async ({ page }) => {
  await syntheticCamera(page);
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Full', 'QuotaExceededError');
    };
  });
  await setup(page);
  await expect(page.locator('#storage-warning')).toBeVisible();
  await expect(page.locator('#storage-warning')).toContainText('Local storage is unavailable');
  await word(page, 'a');
  await expect(page.locator('.target-word')).toHaveText('quick');
});

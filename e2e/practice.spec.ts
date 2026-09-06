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
  expect(persisted.results[0].uncertainPresses).toBe(0);
  expect(persisted.results[0].gradingPolicy).toBe('wrong-finger-veto');
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

test('wrong and erased fingers still retry alongside unknowns; text errors retry; unknowns advance', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  await press(page, 'a', 'left-index');
  await expect(page.locator('#feedback')).not.toContainText('another go');
  await page.locator('#typing').press('Backspace');
  await press(page, 'a', undefined, true);
  await press(page, ' ', undefined, true);
  await expect(page.locator('#feedback')).toContainText('saw left index');
  await expect(page.locator('#feedback')).toContainText('could not verify 2 presses');
  await expect(page.locator('.target-word')).toHaveText('a');
  await expect(page.locator('.press-result.unseen')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/wrong-finger-synthetic.png', fullPage: true });
  await page.locator('#typing').press('Enter');
  await expect(page.locator('#typing')).toHaveValue('');
  await press(page, 'b', undefined, true);
  await press(page, ' ', undefined, true);
  await expect(page.locator('#feedback')).toContainText('text did not match');
  await expect(page.locator('.target-word')).toHaveText('a');
  await page.getByRole('button', { name: 'Try this word again' }).click();
  await press(page, 'a', undefined, true);
  await press(page, ' ', 'right-index');
  await expect(page.locator('#feedback')).toContainText('For space, I saw right index');
  await page.locator('#typing').press('Enter');
  await press(page, 'a', undefined, true);
  await press(page, ' ', undefined, true);
  await expect(page.locator('.target-word')).toHaveText('quick');
  await expect(page.locator('#feedback')).toContainText(
    'Word accepted. I could not verify 2 presses',
  );
  // Mixed word: confident correct letters and an unknown submitting space.
  for (const key of 'quick') await press(page, key);
  await press(page, ' ', undefined, true);
  await expect(page.locator('.target-word')).toHaveText(WORDS[2]!);
  await expect(page.locator('#feedback')).toContainText('could not verify 1 press.');
  await expect(page.locator('.practice-metrics')).toContainText('3 retries');
  await expect(page.getByRole('button', { name: 'Try this word again' })).toHaveCount(0);
  await expect(page.locator('.recovery')).toHaveCount(0);
  // Setup repair remains available voluntarily and preserves the next word.
  await page.getByRole('button', { name: 'Fix camera setup' }).click();
  await page.getByRole('button', { name: 'Check saved key positions' }).click();
  await expect(page.getByRole('button', { name: 'Return to this word' })).toBeDisabled();
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
  await expect(page.locator('.target-word')).toHaveText(WORDS[2]!);
});

test('complete all-unknown passage reports accurate unverified counts, saves and reloads results', async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await syntheticCamera(page);
  await setup(page);
  // Include a failed text attempt so results count unknowns from retries too.
  await press(page, 'b', undefined, true);
  await press(page, ' ', undefined, true);
  await expect(page.locator('#feedback')).toContainText('text did not match');
  await page.locator('#typing').press('Enter');
  for (let i = 0; i < WORDS.length; i++) {
    await expect(page.locator('.target-word')).toHaveText(WORDS[i]!);
    for (const key of WORDS[i]! + ' ') await press(page, key, undefined, true);
    if (i < WORDS.length - 1) {
      await expect(page.locator('.target-word')).toHaveText(WORDS[i + 1]!);
      await expect(page.locator('#feedback')).toContainText('Word accepted. I could not verify');
    }
    if (i === 7)
      await page.screenshot({
        path: 'test-results/unknown-practice-synthetic.png',
        fullPage: true,
      });
  }
  const unknownCount = WORDS.join(' ').length + 1 + 2;
  await expect(page.getByText('PASSAGE COMPLETE', { exact: true })).toBeVisible();
  await expect(page.locator('.result-grid')).toContainText(`${unknownCount}unverified presses`);
  await expect(page.locator('.result-grid')).toContainText('0wrong-finger presses');
  await expect(page.locator('.result-grid')).toContainText('1text-mismatch attempts');
  await expect(page.locator('.result-note')).toContainText('1 retries');
  await expect(page.locator('.result-note')).toContainText('Unverified presses remain unknown');
  await expect(page.locator('.results')).not.toContainText('checked attempt');
  await page.screenshot({ path: 'test-results/unknown-results-synthetic.png', fullPage: true });
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!));
  expect(persisted.results).toHaveLength(1);
  expect(persisted.results[0]).toMatchObject({
    attempts: WORDS.length + 1,
    passedWords: WORDS.length,
    retries: 1,
    wrongFingers: 0,
    textMistakes: 1,
    uncertainPresses: unknownCount,
    gradingPolicy: 'wrong-finger-veto',
  });
  expect(persisted.results[0]).not.toHaveProperty('uncertaintyRetries');
  expect(persisted.results[0].wpm).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Back to the beginning' }).click();
  await expect(page.locator('.recent')).toContainText('1 retries');
  await page.reload();
  await expect(page.locator('.recent')).toContainText(`${persisted.results[0].wpm.toFixed(1)} WPM`);
  await expect(page.locator('.recent')).not.toContainText('Earlier rule');
  expect(errors).toEqual([]);
});

test('legacy results retain their original counts and are labeled with the earlier rule', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'right-typer.v1',
      JSON.stringify({
        results: [
          {
            date: '2026-09-05',
            attempts: 52,
            passedWords: 49,
            textMistakes: 1,
            wrongFingers: 0,
            uncertainPresses: 7,
            uncertaintyRetries: 2,
            retries: 3,
            elapsedMs: 60000,
            wpm: 40,
          },
        ],
      }),
    );
  });
  await page.goto('/');
  await expect(page.locator('.recent')).toContainText('40.0 WPM');
  await expect(page.locator('.recent')).toContainText('3 retries');
  await expect(page.locator('.recent')).toContainText(
    'Earlier rule: unknown presses required retries',
  );
});

test('boundary wait owns input; pause resumes the same word and pasted text cannot advance', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  await press(page, 'a');
  await page.evaluate(() => {
    window.__inferenceDelay = 2500;
  });
  await press(page, ' ');
  await expect(page.locator('#feedback')).toContainText('Matching camera evidence');
  await page.locator('#typing').press('x');
  await expect(page.locator('#input-message')).toContainText('not entered while checking');
  // The bounded wait expires as unknown; late results must not revise the accepted word.
  await expect(page.locator('#feedback')).not.toContainText('Matching camera evidence', {
    timeout: 5000,
  });
  await expect(page.locator('.target-word')).toHaveText('quick');
  await expect(page.locator('#feedback')).toContainText('could not verify');
  await expect(page.locator('#typing')).toHaveValue('');
  await page.waitForTimeout(2700);
  await expect(page.locator('.target-word')).toHaveText('quick');
  await expect(page.locator('.practice-metrics')).toContainText('0 retries');
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

import { test, expect } from '@playwright/test';
import {
  syntheticCamera,
  setup,
  press,
  word,
  openSettings,
  resumePractice,
  editSetup,
} from './helpers';

test('complete guided setup, a whole correctly observed passage, results, restart and persistence', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(150000);
  const external: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).origin !== new URL(baseURL!).origin) external.push(r.url());
  });
  await syntheticCamera(page);
  await setup(page);
  const viewPosition = await page.locator('#view-wrap').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { y: r.top + scrollY, width: r.width, height: r.height };
  });
  let WORDS = await page.locator('.passage > span').allTextContents();
  for (let i = 0; i < WORDS.length; i++) {
    await expect(page.locator('.passage .active')).toHaveText(WORDS[i]!);
    await word(page, WORDS[i]!);
    if (i < WORDS.length - 1)
      await expect(page.locator('.passage .active')).toHaveText(WORDS[i + 1]!);
    if (i === 7)
      await page.screenshot({ path: 'test-results/practice-synthetic.png', fullPage: true });
  }
  await expect(page.locator('#feedback')).toContainText('Round complete');
  expect(
    await page.locator('#view-wrap').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { y: r.top + scrollY, width: r.width, height: r.height };
    }),
  ).toEqual(viewPosition);
  await openSettings(page, 'history-group');
  await page.locator('#history-list > details > summary').first().click();
  await expect(page.locator('#history-list')).toContainText('0 retries');
  await expect(page.locator('.result-grid')).toContainText('0 wrong-finger presses');
  expect(await page.evaluate(() => window.__terminated)).toBe(0);
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!));
  expect(persisted.results).toHaveLength(1);
  expect(persisted.results[0].uncertainPresses).toBe(0);
  expect(persisted.results[0].gradingPolicy).toBe('wrong-finger-veto');
  expect(persisted.results[0].passedWords).toBe(WORDS.length);
  await page.screenshot({ path: 'test-results/results-synthetic.png', fullPage: true });
  await editSetup(page);
  await expect(page.locator('#mapping-editor')).toBeVisible();
  await expect(page.locator('#typing')).toBeDisabled();
  await resumePractice(page);
  await expect(page.locator('#camera-section')).toBeVisible();
  await expect(page.locator('#typing')).toBeFocused();
  WORDS = await page.locator('.passage > span').allTextContents();
  await page.reload();
  await expect(page.locator('#typing')).toBeFocused();
  await expect(page.locator('.passage .active')).toHaveText(WORDS[0]!);
  await openSettings(page, 'about-group');
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
  const WORDS = await page.locator('.passage > span').allTextContents();
  await press(page, 'a', 'left-index');
  await expect(page.locator('#feedback')).not.toContainText('Retry word');
  await page.locator('#typing').press('Backspace');
  for (const key of WORDS[0]!) await press(page, key, undefined, true);
  await press(page, ' ', undefined, true);
  await expect(page.locator('#feedback')).toContainText('saw left index');
  await expect(page.locator('#feedback')).toContainText(
    `could not verify ${WORDS[0]!.length + 1} presses`,
  );
  await expect(page.locator('.passage .active')).toHaveText(WORDS[0]!);
  await expect(page.locator('.press-result.unseen')).toHaveCount(WORDS[0]!.length + 1);
  await page.screenshot({ path: 'test-results/wrong-finger-synthetic.png', fullPage: true });
  // Holding the submitting space must not dismiss feedback, and Enter is no longer retry.
  await page.locator('#typing').dispatchEvent('keydown', { key: ' ', repeat: true });
  await page.locator('#typing').press('Enter');
  await expect(page.locator('#retry')).toBeVisible();
  await page.locator('#typing').press('Space');
  await expect(page.locator('#retry')).toHaveCount(0);
  await expect(page.locator('.passage .active')).toHaveText(WORDS[0]!);
  await expect(page.locator('#typing')).toHaveValue('');
  await press(page, 'b', undefined, true);
  await press(page, ' ', undefined, true);
  await expect(page.locator('#feedback')).toContainText('text did not match');
  await expect(page.locator('.passage .active')).toHaveText(WORDS[0]!);
  await page.getByRole('button', { name: 'Retry word' }).click();
  for (const key of WORDS[0]!) await press(page, key, undefined, true);
  await press(page, ' ', 'right-index');
  await expect(page.locator('#feedback')).toContainText('For space, I saw right index');
  await page.locator('#typing').press('Space');
  for (const key of WORDS[0]!) await press(page, key, undefined, true);
  await press(page, ' ', undefined, true);
  await expect(page.locator('.passage .active')).toHaveText(WORDS[1]!);
  await expect(page.locator('#feedback')).toContainText(
    `Word accepted. I could not verify ${WORDS[0]!.length + 1} presses`,
  );
  // Mixed word: confident correct letters and an unknown submitting space.
  for (const key of WORDS[1]!) await press(page, key);
  await press(page, ' ', undefined, true);
  await expect(page.locator('.passage .active')).toHaveText(WORDS[2]!);
  await expect(page.locator('#feedback')).toContainText('could not verify 1 press.');
  await expect(page.locator('.practice-metrics')).toContainText('3 retries');
  await expect(page.getByRole('button', { name: 'Retry word' })).toHaveCount(0);
  await expect(page.locator('.recovery')).toHaveCount(0);
  // Setup repair remains available voluntarily and preserves the next word.
  await editSetup(page);
  await expect(page.getByRole('button', { name: /^(Start|Resume) practice$/ })).toBeEnabled();
  const { handsAt } = await import('../tests/fixtures');
  await page.evaluate(
    (h) => {
      window.__hands = h;
    },
    handsAt('f', 'left-index'),
  );
  await resumePractice(page);
  await expect(page.locator('.passage .active')).toHaveText(WORDS[2]!);
});

test('a passage with unknown words reports accurate unverified counts, saves and reloads results', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await syntheticCamera(page);
  await setup(page);
  // Include a failed text attempt so results count unknowns from retries too.
  await press(page, 'b', undefined, true);
  await press(page, ' ', undefined, true);
  await expect(page.locator('#feedback')).toContainText('text did not match');
  await page.locator('#typing').press('Space');
  const unknownWords = 2;
  let WORDS = await page.locator('.passage > span').allTextContents();
  for (let i = 0; i < WORDS.length; i++) {
    await expect(page.locator('.passage .active')).toHaveText(WORDS[i]!);
    if (i < unknownWords)
      for (const key of WORDS[i]! + ' ') await press(page, key, undefined, true);
    else await word(page, WORDS[i]!);
    if (i < WORDS.length - 1) {
      await expect(page.locator('.passage .active')).toHaveText(WORDS[i + 1]!);
      if (i < unknownWords)
        await expect(page.locator('#feedback')).toContainText('Word accepted. I could not verify');
    }
    if (i === 1)
      await page.screenshot({
        path: 'test-results/unknown-practice-synthetic.png',
        fullPage: true,
      });
  }
  const unknownCount = WORDS.slice(0, unknownWords).join(' ').length + 1 + 2;
  await expect(page.locator('#feedback')).toContainText('Round complete');
  await openSettings(page, 'history-group');
  await page.locator('#history-list > details > summary').first().click();
  await expect(page.locator('.result-grid')).toContainText(`${unknownCount} unverified presses`);
  await expect(page.locator('.result-grid')).toContainText('0 wrong-finger presses');
  await expect(page.locator('.result-grid')).toContainText('1 text-mismatch attempts');
  await expect(page.locator('#history-list')).toContainText('1 retries');
  await expect(page.locator('#history-list')).toContainText('Unverified presses remain unknown');
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
  await page.locator('#settings-close').click();
  await page.getByRole('button', { name: 'Next round' }).click();
  WORDS = await page.locator('.passage > span').allTextContents();
  await expect(page.locator('#typing')).toBeFocused();
  await expect(page.locator('.passage .active')).toHaveText(WORDS[0]!);
  await expect(page.locator('.practice-metrics')).toContainText('0 /');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('.recent').filter({ hasText: 'Last practice:' })).toContainText(
    '1 retries',
  );
  await page.reload();
  await expect(page.locator('.recent').filter({ hasText: 'Last practice:' })).toContainText(
    `${persisted.results[0].wpm.toFixed(1)} WPM`,
  );
  await expect(page.locator('.recent').filter({ hasText: 'Last practice:' })).not.toContainText(
    'Earlier rule',
  );
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
  await expect(page.locator('.recent').filter({ hasText: 'Last practice:' })).toContainText(
    '40.0 WPM',
  );
  await expect(page.locator('.recent').filter({ hasText: 'Last practice:' })).toContainText(
    '3 retries',
  );
  await expect(page.locator('.recent').filter({ hasText: 'Last practice:' })).toContainText(
    'Earlier rule: unknown presses required retries',
  );
});

test('boundary wait owns input; pause resumes the same word and pasted text cannot advance', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  const WORDS = await page.locator('.passage > span').allTextContents();
  for (const key of WORDS[0]!) await press(page, key);
  const { handsAt } = await import('../tests/fixtures');
  // Completed frames already show a thumb on space; the frame nearest the press is stalled.
  await page.evaluate(
    (h) => {
      window.__hands = h;
    },
    handsAt(' ', 'right-thumb'),
  );
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__inferenceDelay = 2500;
  });
  await page.waitForTimeout(50);
  await page.locator('#typing').press('Space');
  await expect(page.locator('#feedback')).toContainText('Checking fingers');
  await page.locator('#typing').press('x');
  await expect(page.locator('#input-message')).toContainText('not entered while checking');
  // The bounded wait expires and answers from the nearest completed frame; the late result must
  // not revise the accepted word.
  await expect(page.locator('#feedback')).not.toContainText('Checking fingers', {
    timeout: 5000,
  });
  await expect(page.locator('.passage .active')).toHaveText(WORDS[1]!);
  await expect(page.locator('#feedback')).toContainText('Word accepted.');
  await expect(page.locator('#typing')).toHaveValue('');
  await page.waitForTimeout(2700);
  await expect(page.locator('.passage .active')).toHaveText(WORDS[1]!);
  await expect(page.locator('.practice-metrics')).toContainText('0 retries');
  await page.evaluate(() => {
    window.__inferenceDelay = 12;
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await resumePractice(page);
  await page.locator('#typing').dispatchEvent('paste');
  await expect(page.locator('#typing')).toHaveValue('');
  await expect(page.locator('#input-message')).toContainText('Pasting is not graded');
});

test('camera is requested on load; denial is actionable and the button retries once', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__cameraRequests = 0;
    window.__denyCamera = true;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.__cameraRequests++;
      if (window.__denyCamera) throw new DOMException('Denied', 'NotAllowedError');
      return original(constraints);
    };
  });
  await page.goto('/');
  await expect(page.locator('#setup-message')).toContainText('Camera permission is blocked');
  await openSettings(page);
  await expect(page.getByRole('button', { name: 'Remap key positions' })).toBeDisabled();
  expect(await page.evaluate(() => window.__cameraRequests)).toBe(1);
  await page.evaluate(() => {
    window.__denyCamera = false;
  });
  await openSettings(page, 'camera-group');
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  expect(await page.evaluate(() => window.__cameraRequests)).toBe(2);
});

test('saved calibration survives a reload with the same camera', async ({ page }) => {
  await syntheticCamera(page);
  await setup(page);
  const previous = await page.evaluate(
    () => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration,
  );
  await page.reload();
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  const current = await page.locator('video').evaluate((v) => ({
    ...((v as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0]!.getSettings(),
    actualWidth: (v as HTMLVideoElement).videoWidth,
    actualHeight: (v as HTMLVideoElement).videoHeight,
  }));
  expect(current.deviceId, JSON.stringify({ previousDevice: previous.deviceId, current })).toBe(
    previous.deviceId,
  );
  expect(current.actualWidth).toBe(previous.width);
  await expect(page.locator('#typing')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('changed camera identity requires remapping', async ({ page }) => {
  await syntheticCamera(page);
  await setup(page);
  await editSetup(page);
  await page.evaluate(() => {
    window.__deviceId = 'different-camera';
  });
  await openSettings(page, 'camera-group');
  await page.getByRole('button', { name: 'Restart camera' }).click();
  await expect(page.getByRole('button', { name: 'Remap key positions' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^(Start|Resume) practice$/ })).toBeDisabled();
  await expect(page.locator('.cal-key.mapped')).toHaveCount(0);
});

test('missing capture timestamps remain unknown without a setup gate', async ({ page }) => {
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
  await expect(page.locator('#camera-badge')).toContainText('Capture timing unavailable');
  await openSettings(page);
  const { calibration } = await import('../tests/fixtures');
  for (const p of Object.values(calibration().points)) {
    const c = page.locator('#overlay'),
      b = await c.boundingBox();
    await c.click({ position: { x: p.x * b!.width, y: p.y * b!.height } });
  }
  await expect(page.getByRole('button', { name: /^(Start|Resume) practice$/ })).toBeEnabled();
  await resumePractice(page);
  const WORDS = await page.locator('.passage > span').allTextContents();
  await page.locator('#typing').pressSequentially(WORDS[0]!);
  await page.locator('#typing').press('Space');
  await expect(page.locator('.passage .active')).toHaveText(WORDS[1]!);
  await expect(page.locator('#feedback')).toContainText('could not verify');
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
  await expect(page.locator('#setup-message')).toContainText('model asset unavailable');
  expect(await page.locator('video').evaluate((v) => (v as HTMLVideoElement).srcObject)).toBeNull();
  await openSettings(page);
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
  const WORDS = await page.locator('.passage > span').allTextContents();
  await word(page, WORDS[0]!);
  await expect(page.locator('.passage .active')).toHaveText(WORDS[1]!);
});

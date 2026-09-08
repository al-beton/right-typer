import { test, expect } from '@playwright/test';
import { syntheticCamera, setup } from './helpers';
import { PRESETS, calibrationCodes, characterKey } from '../src/core/profile';
import { WORDS } from '../src/passage';
import { calibration } from '../tests/fixtures';

test('presets update physical labels; French shifted punctuation completes passage with unknown evidence', async ({
  page,
}) => {
  test.setTimeout(120000);
  await syntheticCamera(page);
  await page.goto('/');
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  for (const p of PRESETS) {
    await page.locator('#keyboard-profile').selectOption(p.id);
    for (const k of p.keys)
      await expect(page.locator(`[data-key="${k.code}"] b`)).toHaveText(k.label);
  }
  const p = PRESETS[4]!;
  for (const code of calibrationCodes(p)) {
    const k = p.keys.find((k) => k.code === code);
    const pt =
      code === 'space-left'
        ? { x: 0.25, y: 0.85 }
        : code === 'space-right'
          ? { x: 0.65, y: 0.85 }
          : { x: 0.1 + k!.x * 0.07, y: 0.2 + k!.y * 0.2 };
    const box = await page.locator('#overlay').boundingBox();
    await page
      .locator('#overlay')
      .click({ position: { x: pt.x * box!.width, y: pt.y * box!.height } });
  }
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await page.evaluate(() => {
    window.__hands = [];
  });
  await page.waitForTimeout(550);
  for (const word of WORDS) {
    for (const text of word + ' ') {
      const key = characterKey(p, text)!;
      const output = key.outputs.find((o) => o.text === text)!;
      await page
        .locator('#typing')
        .dispatchEvent('keydown', { key: text, code: key.code, shiftKey: output.shift });
    }
    await expect(page.locator('#typing[readonly]')).toHaveCount(0);
  }
  await expect(page.locator('.results')).toContainText('PASSAGE COMPLETE');
  const result = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('right-typer.v1')!).results.at(-1),
  );
  expect(result.retries).toBe(0);
  expect(result.uncertainPresses).toBeGreaterThan(0);
});

test('custom edit/export/import validates and persists safely with literal labels', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.goto('/');
  await page.locator('#custom-layout').click();
  await page.locator('#profile-name').fill('<img src=x onerror=alert(1)>');
  await page.locator('#edit-key').selectOption('KeyQ');
  await page.locator('#capture-key').press('q');
  await page.locator('#alternate-finger').selectOption('left-middle');
  await page.locator('#save-profile').click();
  await expect(page.locator('#profile-status')).toContainText('saved locally');
  const id = await page.locator('#keyboard-profile').inputValue();
  await page.reload();
  await expect(page.locator('#keyboard-profile')).toHaveValue(id);
  const download = page.waitForEvent('download');
  await page.locator('#export-profile').click();
  const path = await (await download).path();
  await page.locator('#import-profile').setInputFiles(path!);
  await expect(page.locator('#profile-status')).toContainText('imported');
  const selected = await page.locator('#keyboard-profile').inputValue();
  await page.locator('#import-profile').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":9}'),
  });
  await expect(page.locator('#profile-status')).toContainText('Last valid profile kept');
  await expect(page.locator('#keyboard-profile')).toHaveValue(selected);
  expect(await page.locator('#profile-settings img').count()).toBe(0);
  await page.locator('#custom-layout').click();
  await page.locator('#delete-profile').click();
  await expect(page.locator('#keyboard-profile')).toHaveValue('us-ansi');
});

test('profile switching invalidates pending attempt and incompatible calibration, then restores British setup', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.addInitScript((c) => {
    localStorage.setItem(
      'right-typer.v1',
      JSON.stringify({
        calibration: { ...c, deviceId: 'synthetic-macbook-camera', width: 960, height: 720 },
        cameraRotation: 90,
        cameraDisconnected: true,
        practiceEnabled: true,
      }),
    );
  }, calibration());
  await page.goto('/');
  await expect(page.locator('#keyboard-profile')).toHaveValue('apple-gb-iso');
  await expect(page.locator('#camera-rotation')).toHaveValue('90');
  await expect(page.locator('#camera-badge')).toContainText('disconnected');
  await page.locator('#start-camera').click();
  await expect(page.locator('#typing')).toBeEnabled();
  await page.locator('#typing').press('a');
  await page.locator('#keyboard-profile').selectOption('fr-iso');
  await expect(page.locator('#typing')).toBeDisabled();
  await expect(page.locator('#practice')).toBeDisabled();
  await expect(page.locator('#profile-status')).toContainText('own key positions');
  await page.locator('#keyboard-profile').selectOption('apple-gb-iso');
  await expect(page.locator('#practice')).toBeEnabled();
  await page.locator('#practice').click();
  await expect(page.locator('#typing')).toHaveValue('');
  await page.locator('#disconnect-camera').click();
  await page.locator('#keyboard-profile').selectOption('fr-iso');
  await page.locator('#keyboard-profile').selectOption('apple-gb-iso');
  await page.locator('#start-camera').click();
  await expect(page.locator('#practice')).toBeEnabled();
  await page.locator('#practice').click();
  await expect(page.locator('#typing')).toHaveValue('');
});
for (const variant of ['success', 'ambiguous', 'absent', 'denied'] as const)
  test(`optional detection ${variant} preserves manual choice`, async ({ page }) => {
    await syntheticCamera(page);
    await page.addInitScript(
      ({ variant, presets }) => {
        Object.defineProperty(navigator, 'keyboard', {
          value:
            variant === 'absent'
              ? undefined
              : {
                  getLayoutMap: async () => {
                    if (variant === 'denied') throw Error('denied');
                    return new Map(
                      presets[variant === 'success' ? 4 : 0]!.keys.map((k) => [
                        k.code,
                        k.outputs.find((o) => !o.shift && !o.altGr)?.text ?? '',
                      ]),
                    );
                  },
                },
          configurable: true,
        });
      },
      { variant, presets: PRESETS },
    );
    await page.goto('/');
    await page.locator('#keyboard-profile').selectOption('de-iso');
    await page.locator('#detect-layout').click();
    await expect(page.locator('#profile-status')).toContainText(
      variant === 'success'
        ? 'Suggestion: French'
        : variant === 'ambiguous'
          ? 'Ambiguous'
          : variant === 'absent'
            ? 'unavailable'
            : 'denied',
    );
    await expect(page.locator('#keyboard-profile')).toHaveValue('de-iso');
  });

test('narrow layout remains centered and keyboard settings are accessible', async ({ page }) => {
  await syntheticCamera(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#keyboard-profile').focus();
  await expect(page.locator('#keyboard-profile')).toBeFocused();
  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    view: innerWidth,
  }));

  expect(widths.page).toBeLessThanOrEqual(widths.view);
  await page.screenshot({ path: '/tmp/alo246-narrow.png', fullPage: true });
});

test('German and French physical presses use the calibrated position and resolved finger', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.goto('/');
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  for (const [id, code, text, finger, shift] of [
    ['de-iso', 'KeyZ', 'y', 'left-little', false],
    ['fr-iso', 'Semicolon', 'm', 'right-little', false],
    ['fr-iso', 'Comma', '.', 'right-middle', true],
  ] as const) {
    await page.locator('#keyboard-profile').selectOption(id);
    const p = PRESETS.find((p) => p.id === id)!;
    if (!(await page.locator('#practice').isEnabled()))
      for (const target of calibrationCodes(p)) {
        const k = p.keys.find((k) => k.code === target);
        const pt =
          target === 'space-left'
            ? { x: 0.25, y: 0.85 }
            : target === 'space-right'
              ? { x: 0.65, y: 0.85 }
              : { x: 0.1 + k!.x * 0.07, y: 0.2 + k!.y * 0.2 };
        const box = await page.locator('#overlay').boundingBox();
        await page
          .locator('#overlay')
          .click({ position: { x: pt.x * box!.width, y: pt.y * box!.height } });
      }
    const key = p.keys.find((k) => k.code === code)!;
    await page.evaluate(
      ({ finger, x, y }) => {
        const [side, digit] = finger.split('-');
        const tips = [4, 8, 12, 16, 20],
          digits = ['thumb', 'index', 'middle', 'ring', 'little'];
        window.__hands = [
          {
            side: side as 'left' | 'right',
            score: 0.99,
            points: Array.from({ length: 21 }, (_, i) =>
              i === tips[digits.indexOf(digit!)] ? { x, y } : { x: 0.01, y: 0.01 },
            ),
          },
        ];
      },
      { finger, x: 0.1 + key.x * 0.07, y: 0.2 + key.y * 0.2 },
    );
    await page.waitForTimeout(100);
    await page.locator('#overlay').dispatchEvent('keydown', { key: text, code, shiftKey: shift });
    await expect(page.locator('#diagnostic-result')).toContainText(
      `saw ${finger.replace('-', ' ')}. Intended: ${finger.replace('-', ' ')}.`,
    );
    await page.locator('#custom-layout').click();
    await page.locator('#edit-key').selectOption(code);
    const before = await page.locator('#diagnostic-result').textContent();
    await page
      .locator('#capture-key')
      .dispatchEvent('keydown', { key: text, code, shiftKey: shift });
    await expect(page.locator('#edit-status')).toContainText('Mapping captured');
    await page.waitForTimeout(150);
    await expect(page.locator('#diagnostic-result')).toHaveText(before!);
    await page.locator('#cancel-profile').click();
  }
});

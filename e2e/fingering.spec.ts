import { LEGACY_CODES } from '../src/core/profile';
import { test, expect } from '@playwright/test';
import { syntheticCamera, setup, press, word, openSettings, resumePractice } from './helpers';
import { allowedFingers, intended, ROWS, MODES, type FingeringMode } from '../src/core/keyboard';

test('policies update labels, hints, errors and preserve camera geometry; refresh and reset', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  const mode = page.getByLabel('Fingering', { exact: true });
  await expect(mode).toHaveValue('standard');
  const geometry = () =>
    page.evaluate(() =>
      ['#finger-map', '#view-wrap'].map((s) => {
        const r = document.querySelector(s)!.getBoundingClientRect();
        return [r.x, r.y + scrollY, r.width, r.height];
      }),
    );
  const initial = await geometry();
  expect(await page.locator('#finger-map').evaluate((el) => el.closest('dialog'))).toBeNull();
  const calibration = await page.evaluate(
    () => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration,
  );
  for (const value of Object.keys(MODES) as FingeringMode[]) {
    await openSettings(page, 'keyboard-group');
    await mode.selectOption(value);
    await resumePractice(page);
    for (const key of [...ROWS.join(''), ' ']) {
      const cell = page.locator(
        `[data-key="${key === ' ' ? 'Space' : (LEGACY_CODES[key] ?? key)}"]`,
      );
      await expect(cell).toHaveAttribute('title', intended(key, value));
      await expect(cell).toHaveAttribute('aria-label', new RegExp(intended(key, value)));
      const split = await cell.evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(split.includes('linear-gradient')).toBe(allowedFingers(key, value).length === 2);
    }
    expect(await geometry()).toEqual(initial);
  }
  // W must continue Q's pink band into E's orange band, rather than reversing them.
  await expect(page.locator('[data-key="KeyW"]')).toHaveCSS(
    'background-image',
    'linear-gradient(90deg, rgb(247, 180, 200) 50%, rgb(255, 195, 131) 50%)',
  );
  await page.screenshot({ path: 'test-results/fingering-either-synthetic.png', fullPage: true });
  await openSettings(page, 'keyboard-group');
  await mode.selectOption('alternate');
  await resumePractice(page);
  await press(page, 'c', 'left-middle');
  await expect(page.locator('#word-hint')).toContainText('Next:');
  await press(page, ' ', 'right-thumb');
  await expect(page.locator('#feedback')).toContainText(
    'For c, I saw left middle. Use left index.',
  );
  await expect(page.locator('.press-result').first()).toHaveClass(/wrong/);
  await expect(page.locator('.press-result').first()).toHaveAttribute(
    'title',
    'Saw left middle; use left index',
  );
  await page.screenshot({
    path: 'test-results/fingering-alternate-retry-synthetic.png',
    fullPage: true,
  });
  await openSettings(page, 'keyboard-group');
  await mode.selectOption('either');
  await resumePractice(page);
  await expect(page.locator('#typing')).toHaveValue('');
  await expect(page.locator('#typing')).not.toHaveAttribute('readonly');
  await expect(page.locator('#policy-status')).toContainText('Fingering updated');
  const WORDS = await page.locator('.passage > span').allTextContents();
  await word(page, WORDS[0]!);
  await expect(page.locator('.passage .active')).toHaveText(WORDS[1]!);
  expect(await page.evaluate(() => window.__terminated)).toBe(0);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration),
  ).toMatchObject({ ...calibration, savedAt: expect.any(Number) });
  await page.reload();
  await expect(mode).toHaveValue('either');
  await expect(page.locator('#typing')).toBeEnabled();
  await openSettings(page, 'about-group');
  await page.getByRole('button', { name: 'Reset local data' }).click();
  await page.getByRole('button', { name: 'Confirm reset' }).click();
  await expect(mode).toHaveValue('standard');
  expect(await page.evaluate(() => localStorage.getItem('right-typer.v1'))).toBeNull();
});

test('switch while typing and checking discards pending evidence and separates curriculum cohorts', async ({
  page,
}) => {
  test.setTimeout(120000);
  await syntheticCamera(page);
  await setup(page);
  const mode = page.getByLabel('Fingering', { exact: true });
  let WORDS = await page.locator('.passage > span').allTextContents();
  await word(page, WORDS[0]!);
  await page.locator('#typing').press('x');
  await openSettings(page, 'keyboard-group');
  await mode.selectOption('alternate');
  WORDS = await page.locator('.passage > span').allTextContents();
  await expect(page.locator('.passage .active')).toHaveText(WORDS[0]!);
  await resumePractice(page);
  await expect(page.locator('#typing')).toHaveValue('');
  await page.evaluate(() => {
    window.__hands = [];
    window.__inferenceDelay = 700;
  });
  await page.locator('#typing').pressSequentially(WORDS[0]!);
  await page.locator('#typing').press('Space');
  await expect(page.locator('#feedback')).toContainText('Checking fingers');
  await openSettings(page, 'keyboard-group');
  await mode.selectOption('either');
  await page.waitForTimeout(1000);
  WORDS = await page.locator('.passage > span').allTextContents();
  await expect(page.locator('.passage .active')).toHaveText(WORDS[0]!);
  await resumePractice(page);
  await expect(page.locator('#typing')).toHaveValue('');
  await page.evaluate(() => {
    window.__inferenceDelay = 12;
  });
  // No hands: correct text advances honestly as unknown, using the real boundary machinery.
  for (const value of WORDS) {
    await page.locator('#typing').pressSequentially(value);
    await page.locator('#typing').press('Space');
    await expect(page.locator('#typing[readonly]')).toHaveCount(0);
  }
  await expect(page.locator('.recent').filter({ hasText: 'Last practice:' })).toContainText(
    'Either',
  );
  await openSettings(page, 'keyboard-group');
  await mode.selectOption('alternate');
  await expect(page.locator('.recent').filter({ hasText: 'Last practice:' })).toContainText(
    'Either',
  );
  const result = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('right-typer.v1')!).results.at(-1),
  );
  expect(result.fingeringModes).toEqual(['either']);
  expect(result.attempts).toBe(WORDS.length);
  expect(result.retries).toBe(0);
  await page.screenshot({
    path: 'test-results/fingering-mixed-results-synthetic.png',
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator('.recent').filter({ hasText: 'Last practice:' })).toContainText(
    'Either',
  );
});

test('selector supports keyboard focus, updates diagnostics and ignores malformed saved policy', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.addInitScript(() =>
    localStorage.setItem('right-typer.v1', JSON.stringify({ fingeringMode: 'bogus', results: [] })),
  );
  await setup(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const mode = page.getByLabel('Fingering', { exact: true });
  await expect(mode).toHaveValue('standard');
  await openSettings(page, 'keyboard-group');
  await mode.focus();
  await expect(mode).toBeFocused();
  await mode.press('Tab');
  await expect(page.locator('#keyboard-profile')).toBeFocused();
  // Use Playwright's native-select API; macOS headless popup keys are not reliable.
  await openSettings(page, 'keyboard-group');
  await mode.selectOption('alternate');
  await expect(mode).toHaveValue('alternate');
  await openSettings(page);
  await page.locator('#diagnostic').press('c');
  await expect(page.locator('#diagnostic-result')).toContainText('Intended: left index.');
  await openSettings(page, 'keyboard-group');
  await mode.selectOption('either');
  await openSettings(page);
  await page.locator('#diagnostic').press('c');
  await expect(page.locator('#diagnostic-result')).toContainText(
    'Intended: left middle or left index.',
  );
  await expect(page.locator('#typing')).toBeDisabled();
});

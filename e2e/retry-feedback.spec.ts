import { test, expect } from '@playwright/test';
import { setup, syntheticCamera, press } from './helpers';
import { PRESETS } from '../src/core/profile';
import { emptyData, getCohort, signature } from '../src/curriculum/progress';
import { generateRound, WORDS_BY_ID } from '../src/curriculum/selection';
import { PROGRESS_KEY } from '../src/curriculum/storage';

async function era(page: import('@playwright/test').Page) {
  const data = emptyData();
  const cohort = getCohort(data, signature(PRESETS[0]!, 'standard'), 22);
  generateRound(cohort, PRESETS[0]!);
  cohort.course.round!.slots[0]!.word = [...WORDS_BY_ID].find(([, text]) => text === 'era')![0];
  await page.addInitScript(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), {
    key: PROGRESS_KEY,
    data,
  });
  await syntheticCamera(page, undefined, true);
  await setup(page, false, '/', true);
  await expect(page.locator('#current-target')).toHaveText('era');
}

test('era flags actual R, keeps focus, reveals observation, clears on retry at desktop and 375px', async ({
  page,
}, info) => {
  await era(page);
  const geometry = await page.locator('#camera-preview').boundingBox();
  await page.evaluate(() => {
    const status = document.querySelector('#practice-status')!;
    (window as unknown as { retryAnnouncements: string[] }).retryAnnouncements = [];
    new MutationObserver(() => {
      if (status.textContent?.includes('Wrong finger'))
        (window as unknown as { retryAnnouncements: string[] }).retryAnnouncements.push(
          status.textContent,
        );
    }).observe(status, { childList: true, subtree: true, characterData: true });
  });
  await press(page, 'e');
  await press(page, 'r', 'left-middle');
  await press(page, 'a');
  await press(page, ' ');
  await expect(page.locator('.error-key')).toHaveText('R');
  await expect(page.locator('.retry-summary')).toHaveText(
    'RWrong fingerDetected: left middle→ Use: left index',
  );
  await expect(page.locator('#ready-message')).toHaveText(
    'R: Wrong finger. Detected: left middle. Use left index.',
  );
  await expect(page.locator('#typing')).toBeFocused();
  await expect(page.locator('#word-hint')).toBeEmpty();
  expect(
    await page.evaluate(
      () => (window as unknown as { retryAnnouncements: string[] }).retryAnnouncements,
    ),
  ).toEqual(['R: Wrong finger. Detected: left middle. Use left index.']);
  await expect(page.locator('#attempt-evidence')).not.toHaveAttribute('open', '');
  await expect(page.locator('.finger-comparison')).toContainText('Detected: left middle');
  expect((await page.locator('#camera-preview').boundingBox())?.y).toBe(geometry?.y);
  await page.screenshot({
    path: `test-results/retry-era-${info.project.name}.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 1000 });
  await expect(page.locator('.error-key')).toBeVisible();
  await expect(page.locator('#retry')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.screenshot({
    path: `test-results/retry-era-narrow-${info.project.name}.png`,
    fullPage: true,
  });
  await page.locator('#attempt-evidence summary').click();
  await expect(page.locator('.press-result').nth(1)).toContainText('RDetected: left middle');
  await page.screenshot({
    path: `test-results/retry-era-details-${info.project.name}.png`,
    fullPage: true,
  });
  await page.locator('#retry').click();
  await expect(page.locator('.error-key')).toHaveCount(0);
  await expect(page.locator('#attempt-evidence')).toHaveCount(0);
  await expect(page.locator('#typing')).toBeFocused();
  await expect(page.locator('#typing')).toHaveValue('');
});

test('multiple, erased and repeated keys, mixed text, Space and unknown-pass keep their meanings', async ({
  page,
}) => {
  await era(page);
  await press(page, 'r', 'left-middle');
  await page.locator('#typing').press('Backspace');
  await press(page, 'r', 'left-middle');
  await page.locator('#typing').press('Backspace');
  await press(page, 'a', 'left-index');
  await press(page, ' ', 'right-index');
  await expect(page.locator('.error-key')).toHaveText(['R', 'A', 'Space']);
  await expect(page.locator('.retry-text')).toHaveText('Wrong textType era');
  await expect(page.locator('.retry-correction').last()).toContainText('Use: either thumb');
  await page.locator('#attempt-evidence summary').click();
  await expect(page.locator('.press-result')).toHaveCount(4);
  await expect(page.locator('.press-result').nth(0)).toContainText('RDetected: left middle');
  await expect(page.locator('.press-result').nth(1)).toContainText('RDetected: left middle');
  await page.locator('#retry').click();
  await press(page, 'e', undefined, true);
  await press(page, ' ', undefined, true);
  await expect(page.locator('.retry-text')).toContainText('Wrong text');
  await expect(page.locator('.error-key')).toHaveCount(0);
  await expect(page.locator('.press-result.unseen')).toHaveCount(2);
  await page.locator('#retry').click();
  for (const k of 'era ') await press(page, k, undefined, true);
  await expect(page.locator('.passage > .passed')).toHaveCount(1);
  await expect(page.locator('#feedback')).toContainText('could not verify 4 presses');
  await expect(page.locator('.error-key')).toHaveCount(0);
});

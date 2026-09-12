import { test, expect } from '@playwright/test';
import { setup, syntheticCamera, press } from './helpers';
import { PROGRESS_KEY, parseProgress } from '../src/curriculum/storage';
import { ORDER } from '../src/curriculum/progress';

test('earns an unlock through several real browser rounds and resumes the prepared round', async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await syntheticCamera(page);
  await setup(page);
  await page.evaluate(() => {
    window.__hands = [];
  });
  await page.waitForTimeout(600);
  let rounds = 0;
  while (rounds < 18) {
    const words = await page.locator('.passage > span').allTextContents();
    expect(words).toHaveLength(12);
    for (let i = 0; i < words.length; i++) {
      await expect(page.locator('#current-target')).toHaveText(words[i]!);
      await page.locator('#typing').pressSequentially(words[i]!, { delay: 40 });
      await page.locator('#typing').press('Space');
      if (i === words.length - 1) await expect(page.locator('#restart')).toBeVisible();
      else await expect(page.locator('.passage > .passed')).toHaveCount(i + 1);
    }
    rounds++;
    const raw = await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY);
    const data = parseProgress(raw!);
    const c = data.cohorts[0]!;
    expect(c.total).toBeGreaterThan(0);
    expect(Object.values(c.actual).every((a) => a.compliant === 0)).toBe(true);
    if (c.course.included > 7) {
      expect(c.course.included).toBe(8);
      expect([...c.course.qualified].sort()).toEqual(ORDER.slice(0, 7).sort());
      await expect(page.locator('#round-focus')).toContainText('New key: o');
      await page.screenshot({ path: '/tmp/alo282-earned-unlock.png' });
      const prepared = c.course.round;
      await page.reload();
      await expect(page.locator('#typing')).toBeEnabled();
      const after = parseProgress(
        (await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY))!,
      ).cohorts[0]!;
      expect(after.course.round).toEqual(prepared);
      await expect(page.locator('#round-focus')).toContainText('8 keys');
      await page.screenshot({ path: '/tmp/alo282-saved-continuation.png' });
      expect(errors).toEqual([]);
      return;
    }
    await page.locator('#restart').click();
    await expect(page.locator('#typing')).toHaveValue('');
  }
  throw Error(`No earned unlock after ${rounds} rounds`);
});

test('wrong observed finger still vetoes a generated word and retry Space adds no progress', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  const word = await page.locator('#current-target').textContent();
  for (const key of word!) await press(page, key, 'right-little');
  await press(page, ' ');
  await expect(page.locator('#retry')).toBeVisible();
  await page.waitForTimeout(600);
  const before = parseProgress(
    (await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY))!,
  ).cohorts[0]!.total;
  await page.locator('#typing').press('Space');
  await expect(page.locator('#typing')).toHaveValue('');
  await page.waitForTimeout(600);
  const after = parseProgress(
    (await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY))!,
  ).cohorts[0]!.total;
  expect(after).toBe(before);
  await expect(page.locator('#current-target')).toHaveText(word!);
});

test('final-stage punctuation continues and held submission cannot enter the next round', async ({
  page,
}) => {
  const { PRESETS } = await import('../src/core/profile');
  const { emptyData, getCohort, signature } = await import('../src/curriculum/progress');
  const { generateRound } = await import('../src/curriculum/selection');
  const data = emptyData(),
    c = getCohort(data, signature(PRESETS[0]!, 'standard'), 22);
  c.course.included = 29;
  c.course.qualified = ORDER.slice(0, 28);
  generateRound(c, PRESETS[0]!);
  await page.addInitScript(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), {
    key: PROGRESS_KEY,
    data,
  });
  await syntheticCamera(page);
  await setup(page);
  await page.evaluate(() => {
    window.__hands = [];
  });
  await page.waitForTimeout(600);
  const words = await page.locator('.passage > span').allTextContents();
  expect(words.filter((word) => word.endsWith('.')).length).toBeGreaterThanOrEqual(8);
  for (let i = 0; i < words.length; i++) {
    await page.locator('#typing').pressSequentially(words[i]!);
    if (i === words.length - 1) await page.keyboard.down('Space');
    else await page.locator('#typing').press('Space');
    if (i < words.length - 1) await expect(page.locator('.passage > .passed')).toHaveCount(i + 1);
  }
  await expect(page.locator('#restart')).toBeVisible();
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await expect(page.locator('#restart')).toBeVisible();
  await page.locator('#restart').click();
  await expect(page.locator('#typing')).toHaveValue('');
  await expect(page.locator('#round-focus')).toContainText('Round 2');
  await expect(page.locator('#round-focus')).toContainText('29 keys');
});

test('another tab cannot overwrite progress, and corrupt data stays intact until explicit reset', async ({
  page,
  context,
}) => {
  await syntheticCamera(page);
  await setup(page);
  const before = await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY);
  const second = await context.newPage();
  await syntheticCamera(second);
  await second.goto('/');
  await expect(second.locator('#storage-warning')).toContainText('Another tab owns saved progress');
  await second.locator('#typing').press('e');
  await second.waitForTimeout(600);
  expect(await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY)).toBe(before);
  await second.close();
  // A new context owns its lock; invalid history must survive ordinary practice.
  const isolated = await context.browser()!.newContext({ permissions: ['camera'] });
  const corrupt = await isolated.newPage();
  await syntheticCamera(corrupt);
  await corrupt.addInitScript((key) => {
    if (!sessionStorage.getItem('corrupt-seeded')) {
      localStorage.setItem(key, '{"version":99}');
      sessionStorage.setItem('corrupt-seeded', 'yes');
    }
  }, PROGRESS_KEY);
  await corrupt.goto(page.url());
  await expect(corrupt.locator('#storage-warning')).toContainText(
    'Saved progress could not be read',
  );
  expect(await corrupt.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY)).toBe(
    '{"version":99}',
  );
  await corrupt.locator('#settings-open').click();
  await corrupt.locator('#about-group > summary').click();
  await corrupt.locator('#reset').click();
  await corrupt.locator('#reset').click();
  expect(await corrupt.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY)).toBeNull();
  await corrupt.reload();
  await expect(corrupt.locator('#storage-warning')).toBeHidden();
  await expect
    .poll(() => corrupt.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY))
    .not.toBeNull();
  await isolated.close();
});

test('missing required outputs explains profile repair and retains the prior cohort', async ({
  page,
}) => {
  const { PRESETS } = await import('../src/core/profile');
  const { emptyData, getCohort, signature } = await import('../src/curriculum/progress');
  const { generateRound } = await import('../src/curriculum/selection');
  const profile = structuredClone(PRESETS[0]!);
  profile.id = 'missing-e';
  profile.name = 'Missing E';
  profile.keys.find((key) => key.code === 'KeyE')!.outputs = [];
  const data = emptyData(),
    c = getCohort(data, signature(profile, 'standard'), 44);
  c.course.qualified = ['n'];
  generateRound(c, profile);
  await page.addInitScript(
    ({ profile, data, key }) => {
      localStorage.setItem(
        'right-typer.v1',
        JSON.stringify({ results: [], profileId: profile.id, customProfiles: [profile] }),
      );
      localStorage.setItem(key, JSON.stringify(data));
    },
    { profile, data, key: PROGRESS_KEY },
  );
  await syntheticCamera(page);
  await page.goto('/');
  await expect(page.locator('#ready-message')).toContainText('Missing practice characters: e');
  await expect(page.locator('#practice')).toBeDisabled();
  await page.locator('#settings-open').click();
  await page.locator('#keyboard-group > summary').click();
  await page.locator('#custom-layout').click();
  await page.locator('#edit-key').selectOption('KeyE');
  await page.locator('#capture-key').press('e');
  await page.locator('#save-profile').click();
  await expect(page.locator('#ready-message')).not.toContainText('Missing practice characters');
  const after = parseProgress(
    (await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY))!,
  );
  expect(after.cohorts.find((item) => item.signature === c.signature)?.course.qualified).toEqual([
    'n',
  ]);
  expect(after.cohorts).toHaveLength(2);
});

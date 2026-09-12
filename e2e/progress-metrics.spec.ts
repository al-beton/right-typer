import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticCamera, setup, press, openSettings } from './helpers';
import { emptyData, getCohort, signature, type ProgressData } from '../src/curriculum/progress';
import { PRESETS } from '../src/core/profile';
import { generateRound } from '../src/curriculum/selection';
import { PROGRESS_KEY, parseProgress } from '../src/curriculum/storage';
function fixture() {
  const data = emptyData(),
    c = getCohort(data, signature(PRESETS[0]!, 'standard'), 75);
  c.course.qualified = ['e'];
  generateRound(c, PRESETS[0]!);
  c.course.round!.slots[0] = { word: 'en-v1-0046', mark: '', target: 'n' };
  return data;
}
async function seed(page: Page, data: unknown) {
  await page.addInitScript(
    ({ key, data }) => {
      if (sessionStorage.getItem('metrics-seeded')) return;
      localStorage.setItem(key, JSON.stringify(data));
      sessionStorage.setItem('metrics-seeded', 'yes');
    },
    { key: PROGRESS_KEY, data },
  );
}
async function exported(page: Page): Promise<ProgressData> {
  const event = page.waitForEvent('download');
  await page.locator('#progress-export').click();
  return JSON.parse(await readFile((await (await event).path())!, 'utf8')) as ProgressData;
}

test('inspect exact target/actual counters, export, reload and reset progress without losing settings', async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL!).origin) external.push(request.url());
  });
  await seed(page, fixture());
  await syntheticCamera(page);
  await setup(page);
  await expect(page.locator('#current-target')).toHaveText('an');
  await press(page, 'a');
  await press(page, 'x', 'left-index');
  await page.locator('#typing').press('Backspace');
  await press(page, 'n');
  await press(page, ' ');
  await expect(page.locator('#retry')).toBeVisible();
  await openSettings(page, 'history-group');
  await expect(page.locator('#progress-view')).toContainText('75.0% (3/4)');
  await page.locator('#progress-title').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/alo280-summary.png' });
  const expected = page.getByRole('region', { name: 'Expected target keys', exact: true });
  await page.getByText('Expected target keys', { exact: true }).click();
  await expect(expected.getByRole('row').filter({ hasText: 'KeyN' })).toContainText('50.0% (1/2)');
  await page.getByText('Actual physical keys', { exact: true }).click();
  const actual = page.getByRole('region', { name: 'Actual physical keys', exact: true });
  await expect(actual.getByRole('row').filter({ hasText: 'KeyX' })).toContainText('0.0% (0/1)');
  const data = await exported(page),
    c = data.cohorts[0]!;
  expect(data.version).toBe(2);
  expect([c.correct, c.total, c.corrections]).toEqual([3, 4, 1]);
  expect(c.actual.KeyX).toMatchObject({ observed: 1, compliant: 0, handCompliant: 1 });
  expect(c.activeMs).toBeGreaterThan(0);
  expect(data.activity.days).toHaveLength(1);
  const raw = JSON.stringify(data);
  expect(raw).not.toContain('synthetic-macbook-camera');
  expect(raw).not.toContain('calibration');
  expect(raw).not.toContain('frameIds');
  await page.screenshot({ path: '/tmp/alo280-inspector.png' });
  await page.reload();
  await openSettings(page, 'history-group');
  expect((await exported(page)).cohorts[0]!.total).toBe(4);
  const settings = await page.evaluate(() => localStorage.getItem('right-typer.v1'));
  await page.locator('#progress-reset').click();
  await expect(page.locator('#progress-reset')).toHaveText('Confirm reset progress');
  await page.locator('#progress-reset').click();
  const reset = await exported(page);
  expect(reset.cohorts[0]!.total).toBe(0);
  expect(reset.cohorts[0]!.course.included).toBe(7);
  expect(reset.activity.days).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('right-typer.v1'))).toBe(settings);
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .locator('#progress-view details')
    .evaluateAll((details) =>
      details.forEach((detail) => ((detail as HTMLDetailsElement).open = false)),
    );
  await page.locator('#progress-title').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/alo280-reset-390.png' });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('v1 adaptive evidence migrates, with old thumb sides and active time explicitly unrecorded', async ({
  page,
}) => {
  const data = fixture();
  data.cohorts[0]!.total = 2;
  data.cohorts[0]!.correct = 2;
  data.cohorts[0]!.actual.Space = {
    total: 2,
    observed: 1,
    compliant: 1,
    handCompliant: 1,
    unknown: 1,
    recent: [{ outcome: 'compliant' }, { outcome: 'unknown' }],
  };
  const old = JSON.parse(JSON.stringify(data)) as {
    version: number;
    activity?: unknown;
    cohorts: Record<string, unknown>[];
  };
  old.version = 1;
  delete old.activity;
  for (const c of old.cohorts) {
    delete c.activeMs;
    delete c.space;
    delete c.excludedActivity;
  }
  await seed(page, old);
  await syntheticCamera(page);
  await setup(page);
  await openSettings(page, 'history-group');
  await page.getByText('Space and thumb usage', { exact: true }).click();
  const current = await exported(page);
  expect(current.cohorts[0]!.space).toEqual({ left: 0, right: 0, other: 0, unclassified: 1 });
  expect(current.cohorts[0]!.activeMs).toBe(0);
  expect(current.cohorts[0]!.course.qualified).toEqual(['e']);
  await expect(page.locator('#progress-view')).toContainText('No data');
  await expect(page.locator('#progress-view')).toContainText(
    'Older observed Space without a recorded side',
  );
});

test('date capacity preserves saved history while export and progress-only reset recover', async ({
  page,
}) => {
  const data = fixture();
  data.activity.days = Array.from({ length: 90 }, (_, i) => ({
    date: new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
    ms: 100,
  }));
  await seed(page, data);
  await syntheticCamera(page);
  await setup(page);
  const baseline = await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY);
  await page.locator('#typing').pressSequentially('an', { delay: 100 });
  await expect(page.locator('#storage-warning')).toContainText('Local progress is full');
  expect(await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY)).toBe(baseline);
  await openSettings(page, 'history-group');
  await expect(page.locator('#progress-status')).toContainText('Local progress is full');
  expect((await exported(page)).activity.days).toHaveLength(91);
  await page.locator('#progress-reset').click();
  await page.locator('#progress-reset').click();
  await expect(page.locator('#storage-warning')).toBeHidden();
  const saved = parseProgress(
    (await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY))!,
  );
  expect(saved.activity.days).toEqual([]);
  expect(saved.cohorts[0]!.total).toBe(0);
});

test('progress reset after a recorded completed round stops recording before changing exercises', async ({
  page,
}) => {
  await seed(page, fixture());
  await syntheticCamera(page);
  await setup(page);
  await page.evaluate(() => {
    window.__hands = [];
  });
  await page.waitForTimeout(600);
  await openSettings(page, 'debugging');
  await page.locator('#sample-start').click();
  const words = await page.locator('.passage > span').allTextContents();
  for (const value of words) {
    await page.locator('#typing').pressSequentially(value + ' ');
    await expect(page.locator('#typing[readonly]')).toHaveCount(0);
  }
  await expect(page.locator('#restart')).toBeVisible();
  await expect(page.locator('#sample-indicator')).toContainText('Recording');
  await openSettings(page, 'history-group');
  await page.locator('#progress-reset').click();
  await page.locator('#progress-reset').click();
  await expect(page.locator('#sample-indicator')).not.toContainText('Recording');
  await openSettings(page, 'debugging');
  await expect(page.locator('#sample-download')).toBeEnabled({ timeout: 30000 });
  await expect(page.locator('#sample-stop')).toBeDisabled();
  const data = parseProgress(
    (await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY))!,
  );
  expect(data.cohorts[0]!.total).toBe(0);
  expect(
    JSON.parse((await page.evaluate(() => localStorage.getItem('right-typer.v1')))!).results,
  ).toHaveLength(1);
});

test('sixteen saved cohorts are retained when a new mapping must practise in memory', async ({
  page,
}) => {
  const data = emptyData();
  for (let i = 0; i < 16; i++) {
    const profile = structuredClone(PRESETS[0]!);
    profile.keys[0]!.x += (i + 1) / 100;
    const c = getCohort(data, signature(profile, 'standard'), i + 1);
    generateRound(c, profile);
  }
  await seed(page, data);
  await syntheticCamera(page);
  await setup(page);
  await expect(page.locator('#storage-warning')).toContainText('Local progress is full');
  const saved = parseProgress(
    (await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY))!,
  );
  expect(saved.cohorts.map((c) => c.signature)).toEqual(data.cohorts.map((c) => c.signature));
  await openSettings(page, 'history-group');
  expect((await exported(page)).cohorts).toHaveLength(17);
  await page.locator('#progress-reset').click();
  await page.locator('#progress-reset').click();
  expect(
    parseProgress((await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY))!).cohorts,
  ).toHaveLength(1);
  await expect(page.locator('#storage-warning')).toBeHidden();
});

test('progress reset in a non-writing tab cannot delete the writer history', async ({
  page,
  context,
}) => {
  await seed(page, fixture());
  await syntheticCamera(page);
  await setup(page);
  await press(page, 'a');
  await openSettings(page, 'history-group');
  const before = await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY);
  const second = await context.newPage();
  await syntheticCamera(second);
  await second.goto('/');
  await expect(second.locator('#storage-warning')).toContainText('Another tab owns saved progress');
  await openSettings(second, 'history-group');
  await second.locator('#progress-reset').click();
  await second.locator('#progress-reset').click();
  await expect(second.locator('#progress-status')).toContainText('Progress reset in memory only');
  expect(await page.evaluate((key) => localStorage.getItem(key), PROGRESS_KEY)).toBe(before);
  expect((await exported(second)).cohorts[0]!.total).toBe(0);
  await second.close();
});

import { test, expect, type Page } from '@playwright/test';
import { emptyData, getCohort, signature } from '../src/curriculum/progress';
import { localDate } from '../src/curriculum/activity';
import { PRESETS } from '../src/core/profile';
import { PROGRESS_KEY } from '../src/curriculum/storage';
import { syntheticCamera, setup, press, openSettings } from './helpers';
const wall = Date.UTC(2026, 8, 13, 12);
async function seed(page: Page, ms: number) {
  await page.clock.setSystemTime(new Date(wall));
  const data = emptyData();
  getCohort(data, signature(PRESETS[0]!, 'standard'), 72);
  data.activity.days = [{ date: localDate(wall)!, ms }];
  await page.addInitScript(
    ({ key, data }) => {
      if (sessionStorage.getItem('goal-seeded')) return;
      localStorage.setItem(key, JSON.stringify(data));
      sessionStorage.setItem('goal-seeded', 'yes');
    },
    { key: PROGRESS_KEY, data },
  );
}
const milliseconds = (page: Page) =>
  page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key)!).activity.days.reduce(
        (n: number, d: { ms: number }) => n + d.ms,
        0,
      ),
    PROGRESS_KEY,
  );
test('completion is not rounded early, arrives without interrupting input and permits continued practice', async ({
  page,
}) => {
  await seed(page, 599999);
  await syntheticCamera(page);
  await setup(page);
  await expect(page.locator('#daily-goal')).toHaveText('Today 9 / 10 min');
  const word = (await page.locator('#current-target').textContent())!;
  await press(page, word[0]!);
  await press(page, word[1]!);
  await expect(page.locator('#daily-goal')).toContainText('Daily goal met');
  await expect(page.locator('#typing')).toBeFocused();
  await expect(page.locator('#typing')).toHaveValue(word.slice(0, 2));
  await page.locator('#typing').press('Backspace');
  await expect(page.locator('#typing')).toBeEnabled();
  await openSettings(page, 'history-group');
  await expect(page.locator('#daily-goal-detail')).toContainText('Daily goal met');
  await page
    .locator('#daily-goal-settings')
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: '/tmp/alo284-met-detail.png' });
  await expect.poll(() => milliseconds(page)).toBeGreaterThanOrEqual(600000);
  const stopped = await milliseconds(page);
  await page.waitForTimeout(1200);
  expect(await milliseconds(page)).toBe(stopped);
  await page.locator('#settings-close').click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/alo284-met-390.png' });
});
test('edit/off/resume retains activity, persisted goal survives scoped reset, invalid values do not apply', async ({
  page,
}) => {
  await seed(page, 240000);
  await syntheticCamera(page);
  await setup(page);
  await expect(page.locator('#daily-goal')).toHaveText('Today 4 / 10 min');
  await openSettings(page, 'history-group');
  await page.locator('#daily-goal-minutes').fill('0');
  await expect(page.locator('#daily-goal')).toBeHidden();
  await expect(page.locator('#daily-goal-detail')).toContainText('Goal off');
  await page.locator('#settings-resume').click();
  const word = (await page.locator('#current-target').textContent())!;
  await press(page, word[0]!);
  await press(page, word[1]!);
  await openSettings(page, 'history-group');
  await expect.poll(() => milliseconds(page)).toBeGreaterThan(240000);
  await page.locator('#daily-goal-minutes').fill('7');
  await expect(page.locator('#daily-goal')).toHaveText('Today 4 / 7 min');
  await page.locator('#daily-goal-minutes').fill('121');
  await expect(page.locator('#daily-goal-minutes')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#daily-goal')).toHaveText('Today 4 / 7 min');
  await page.locator('#daily-goal-minutes').fill('1.5');
  await expect(page.locator('#daily-goal-validation')).toContainText('whole number');
  await page.locator('#daily-goal-minutes').fill('7');
  const calibration = await page.evaluate(
    () => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration,
  );
  await page.locator('#progress-reset').click();
  await page.locator('#progress-reset').click();
  await expect(page.locator('#daily-goal')).toHaveText('Today 0 / 7 min');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration),
  ).toEqual(calibration);
  await page.reload();
  await expect(page.locator('#daily-goal')).toHaveText('Today 0 / 7 min');
  await openSettings(page, 'history-group');
  await expect(page.locator('#daily-goal-minutes')).toHaveValue('7');
  await page.locator('#daily-goal-minutes').fill('120');
  await expect(page.locator('#daily-goal')).toHaveText('Today 0 / 120 min');
});
test('local day changes only presentation; second tab and denied goal storage retain honest progress notices', async ({
  page,
  context,
}) => {
  await seed(page, 600000);
  await page.goto('/');
  await expect(page.locator('#daily-goal')).toContainText('Daily goal met');
  const before = await milliseconds(page);
  await page.clock.setSystemTime(new Date(wall + 86400000));
  await expect(page.locator('#daily-goal')).toHaveText('Today 0 / 10 min');
  expect(await milliseconds(page)).toBe(before);
  const other = await context.newPage();
  await other.clock.setSystemTime(new Date(wall));
  await other.goto('/');
  await expect(other.locator('#storage-warning')).toContainText(/another tab/i);
  await expect(other.locator('#daily-goal')).toContainText('Daily goal met');
  expect(await milliseconds(other)).toBe(before);
  await other.close();
  // Playwright clock updates are shared by pages in this browser context.
  await page.clock.setSystemTime(new Date(wall + 86400000));
  await openSettings(page, 'history-group');
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('Denied', 'QuotaExceededError');
    };
  });
  await page.locator('#daily-goal-minutes').fill('5');
  await expect(page.locator('#daily-goal')).toHaveText('Today 0 / 5 min');
  await expect(page.locator('#storage-warning')).toContainText('storage is unavailable');
  expect(await milliseconds(page)).toBe(before);
});

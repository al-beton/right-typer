import { test, expect, type Page } from '@playwright/test';
import { PRESETS } from '../src/core/profile';
import { emptyData, getCohort, signature, targetId } from '../src/curriculum/progress';
import { PROGRESS_KEY } from '../src/curriculum/storage';
import { syntheticCamera, setup, press } from './helpers';
const data = () => {
  const data = emptyData(),
    c = getCohort(data, signature(PRESETS[0]!, 'standard'), 9);
  c.targets[targetId('n', 'KeyN')] = {
    character: 'n',
    code: 'KeyN',
    total: 40,
    correct: 20,
    recent: [],
    timings: Array.from({ length: 20 }, () => ({ ms: 1800, word: 'en-v1-0046', round: 1 })),
    excludedTimings: 3,
  };
  c.actual.KeyX = {
    total: 10,
    observed: 8,
    compliant: 6,
    handCompliant: 8,
    unknown: 2,
    recent: [],
  };
  c.actual.KeyN = {
    total: 40,
    observed: 0,
    compliant: 0,
    handCompliant: 0,
    unknown: 40,
    recent: [],
  };
  c.actual.Space = {
    total: 10,
    observed: 6,
    compliant: 5,
    handCompliant: 6,
    unknown: 4,
    recent: [],
  };
  c.space = { left: 3, right: 2, other: 1, unclassified: 0 };
  c.total = 60;
  c.correct = 20;
  return data;
};
async function seed(page: Page) {
  await page.addInitScript(
    ({ data, key }) => {
      if (sessionStorage.getItem('heatmap-seeded')) return;
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem('right-typer.v1', JSON.stringify({ profileId: 'us-ansi', results: [] }));
      sessionStorage.setItem('heatmap-seeded', 'yes');
    },
    { data: data(), key: PROGRESS_KEY },
  );
}
async function selectDetail(page: Page, code: string) {
  if (!(await page.locator('#settings').evaluate((el: HTMLDialogElement) => el.open)))
    await page.locator('#key-details-open').click();
  await page.locator('#heatmap-key').selectOption(code);
}
test('exact evidence views, accessible single key selector, persisted choice and scoped reset', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/');
  await expect(page.locator('#keyboard-view')).toHaveValue('fingers');
  await expect(page.locator('#keyboard-view option')).toHaveCount(6);
  await page.locator('#keyboard-view').selectOption('accuracy');
  const n = page.locator('[data-key="KeyN"]');
  await expect(n).toHaveAttribute('data-evidence', 'normal');
  await expect(n).toHaveAttribute('aria-label', /50.0%.*20\/40 prompted/);
  await expect(page.locator('#heatmap-legend')).toContainText('0% → 100%');
  await selectDetail(page, 'KeyN');
  await expect(page.locator('#heatmap-detail')).toContainText('Expected target character');
  await expect(page.locator('#heatmap-key')).toBeFocused();
  await page.locator('#heatmap-key').press('ArrowDown');
  await expect(page.locator('#heatmap-key')).not.toHaveValue('KeyN');
  await page.locator('#settings-close').click();
  await page.locator('#keyboard-view').selectOption('response');
  await expect(n).toHaveAttribute(
    'aria-label',
    /1800 ms.*20 recent valid intervals; 3 lifetime exclusions/,
  );
  await expect(page.locator('#heatmap-legend')).toContainText('1,200 ms slower → 200 ms faster');
  await page.screenshot({ path: '/tmp/alo283-response.png' });
  await page.locator('#keyboard-view').selectOption('finger');
  await expect(n).toHaveAttribute('data-evidence', 'none');
  const x = page.locator('[data-key="KeyX"]');
  await expect(x).toHaveAttribute('aria-label', /75.0%.*6\/8 observed/);
  await expect(x).toHaveAttribute('data-evidence', 'limited');
  await page.locator('#keyboard-view').selectOption('hand');
  await expect(x).toHaveAttribute('aria-label', /100.0%.*8\/8 observed/);
  await page.locator('#keyboard-view').selectOption('coverage');
  await expect(n).toHaveAttribute('aria-label', /0.0%.*0\/40 accepted/);
  await selectDetail(page, 'Space');
  await expect(page.locator('#heatmap-detail')).toContainText('60.0% (3/5)');
  await expect(page.locator('#heatmap-detail')).toContainText('40.0% (2/5)');
  await page.locator('#key-inspector').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: '/tmp/alo283-space.png' });
  await page.reload();
  await expect(page.locator('#keyboard-view')).toHaveValue('coverage');
  await expect(n).toHaveAttribute('aria-label', /0.0%.*0\/40 accepted/);
  await selectDetail(page, 'KeyN');
  await page.locator('#progress-reset').click();
  await page.locator('#progress-reset').click();
  await expect(n).toHaveAttribute('data-evidence', 'none');
  await expect(page.locator('#keyboard-view')).toHaveValue('coverage');
  await expect(page.locator('#heatmap-detail')).toContainText('No data');
});
test('view changes preserve the practice attempt, mapping, next-key outline and focus owner; details pause explicitly', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  const word = await page.locator('#current-target').textContent();
  await press(page, word![0]!);
  const before = await page.locator('#typing').inputValue();
  const geometry = await page
    .locator('.physical-position')
    .evaluateAll((els) => els.map((el) => el.getAttribute('style')));
  const next = await page.locator('.next-key').getAttribute('data-key');
  await page.locator('#keyboard-view').selectOption('accuracy');
  await expect(page.locator('#typing')).toHaveValue(before);
  await expect(page.locator('.next-key')).toHaveAttribute('data-key', next!);
  expect(
    await page
      .locator('.physical-position')
      .evaluateAll((els) => els.map((el) => el.getAttribute('style'))),
  ).toEqual(geometry);
  await page.locator('#keyboard-view').focus();
  await page.locator('#keyboard-view').press('ArrowDown');
  await page.locator('#keyboard-view').press('Enter');
  await expect(page.locator('#keyboard-view')).toBeFocused();
  await expect(page.locator('#typing')).toHaveValue(before);
  await page.locator('#typing').focus();
  await page.locator('#typing').press('ArrowDown');
  await expect(page.locator('#typing')).toHaveValue(before);
  await expect(page.locator('#typing')).toBeFocused();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!));
  await page.locator('#key-details-open').click();
  await expect(page.locator('#settings-state')).toContainText('paused');
  await page.locator('#settings-close').click();
  await expect(page.locator('#typing')).toBeDisabled();
  await page.locator('#practice').click();
  await expect(page.locator('#typing')).toHaveValue('');
  await expect(page.locator('#typing')).toBeFocused();
  expect(
    (await page.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!))).calibration,
  ).toMatchObject({ points: saved.calibration.points, profile: saved.calibration.profile });
});
test('all presets and custom multi-output geometry retain legends and guidance at narrow widths and zoom', async ({
  page,
}) => {
  const custom = structuredClone(PRESETS[0]!);
  custom.id = 'heatmap-custom';
  custom.name = 'Heatmap custom';
  custom.keys
    .find((k) => k.code === 'KeyA')!
    .outputs.push({ text: ';', shift: true, altGr: false });
  for (const profile of [...PRESETS, custom]) {
    await page.goto('/');
    await page.evaluate(
      (p) =>
        localStorage.setItem(
          'right-typer.v1',
          JSON.stringify({
            profileId: p.id,
            customProfiles: p.id === 'heatmap-custom' ? [p] : [],
            results: [],
          }),
        ),
      profile,
    );
    await page.reload();
    const geometry = await page
      .locator('.physical-position')
      .evaluateAll((els) => els.map((el) => el.getAttribute('style')));
    const legends = await page.locator('.key b').allTextContents();
    await page.locator('#keyboard-view').selectOption('accuracy');
    expect(
      await page
        .locator('.physical-position')
        .evaluateAll((els) => els.map((el) => el.getAttribute('style'))),
    ).toEqual(geometry);
    expect(await page.locator('.key b').allTextContents()).toEqual(legends);
    await expect(page.locator('[data-key="Space"]')).toHaveAttribute('aria-label', /either thumb/);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width: 780, height: 1688 });
    await page.evaluate(() => (document.body.style.zoom = '2'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => (document.body.style.zoom = ''));
    await page.setViewportSize({ width: 390, height: 844 });
    if (profile.id === custom.id) {
      await selectDetail(page, 'KeyA');
      await expect(page.locator('#heatmap-detail')).toContainText('Other outputs: ; (Shift)');
      await page.locator('#settings-close').click();
      await page.screenshot({ path: '/tmp/alo283-narrow.png' });
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
  }
});

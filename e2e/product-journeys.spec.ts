import { test, expect, type Observation } from './product-driver';
import { EXPECTED } from '../src/core/keyboard';
import type { Finger } from '../src/core/types';
import type { Cohort } from '../src/curriculum/progress';

// Explicit traditional fixture observations; the app still decides correctness.
const observations = (text: string): Observation[] => [...text].map((key) => EXPECTED[key]!);
const negatives: Record<string, { same: Finger; opposite: Finger }> = {
  e: { same: 'left-ring', opposite: 'right-middle' },
  n: { same: 'right-little', opposite: 'left-index' },
  a: { same: 'left-index', opposite: 'right-index' },
  r: { same: 'left-middle', opposite: 'right-index' },
  i: { same: 'right-ring', opposite: 'left-middle' },
  t: { same: 'left-little', opposite: 'right-index' },
};

test('product: explicit fingers, retries, correction and honest unknown coverage', async ({
  product: p,
  page,
}) => {
  const [first, next] = await page.locator('.passage > span').allTextContents();
  const wrong = negatives[first![0]!]!;
  p.events.push({ fixturePolicy: 'traditional starter-key negative fixtures', first, wrong });
  await p.check('fresh target has focus', { target: first, input: '', focus: 'typing' });
  const typo = 'b' + first!.slice(1);
  await p.type(typo, observations(typo));
  await p.submit('left-thumb');
  await expect(page.locator('#feedback')).toContainText('text did not match');
  await p.check('typo remains available to retry', { target: first, input: typo, focus: 'typing' });
  await p.retry();
  await p.press(first![0]!, wrong.same, { code: `Key${first![0]!.toUpperCase()}` });
  await p.backspace();
  await p.type(
    first!,
    [...first!].map(() => 'unknown'),
  );
  await p.submit('unknown');
  await expect(page.locator('#feedback')).toContainText(`saw ${wrong.same.replace('-', ' ')}`);
  await expect(page.locator('#feedback')).toContainText(
    `could not verify ${first!.length + 1} presses`,
  );
  await p.check('backspace retains wrong-finger evidence', { target: first, input: first });
  await p.checkpoint('erased-wrong-finger-retry');
  await p.retry();
  await p.type(first!, [wrong.opposite, ...observations(first!.slice(1))]);
  await p.submit('right-thumb');
  await expect(page.locator('#feedback')).toContainText(`saw ${wrong.opposite.replace('-', ' ')}`);
  await p.retry();
  await p.type(
    first!,
    [...first!].map(() => 'unknown'),
  );
  await p.submit('unknown');
  await p.check('unknown advances with honest coverage', {
    target: next,
    input: '',
    focus: 'typing',
  });
  await expect(page.locator('#feedback')).toContainText(
    `could not verify ${first!.length + 1} presses`,
  );
  await p.type(next!, observations(next!));
  await p.submit('unknown');
  await expect(page.locator('#feedback')).toContainText('could not verify 1 press');
  await p.correctWord('traditional-left-thumb');
  await p.correctWord('traditional-right-thumb');
  await expect(page.locator('.practice-metrics')).toContainText('3 retries');
});

test('product: drawer, native key ownership and explicit recovery keep practice stable', async ({
  product: p,
  page,
}) => {
  await p.correctWord('traditional-right-thumb');
  const target = await p.target(),
    partial = target.slice(0, 2);
  await p.type(partial, observations(partial));
  const keyboard = await page.locator('#finger-map').boundingBox();
  await p.openSettings('keyboard-group');
  expect(await page.locator('#finger-map').boundingBox()).toEqual(keyboard);
  await page.locator('#custom-layout').click();
  await page.locator('#profile-name').fill('Synthetic draft');
  await page.keyboard.press('Space');
  await p.closeSettings();
  await p.check('closing stays paused without changing partial text', {
    target,
    input: partial,
    focus: 'settings-open',
    drawer: false,
  });
  await expect(page.locator('#typing')).toBeDisabled();
  await p.openSettings('keyboard-group');
  await expect(page.locator('#profile-name')).toHaveValue('Synthetic draft ');
  await page.locator('#profile-name').press('Escape');
  await page.locator('#custom-layout').click();
  await expect(page.locator('#profile-name')).toHaveValue('Synthetic draft ');
  await page.locator('#cancel-profile').click();
  await page.locator('#settings-resume').focus();
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await p.check('held resume activation never submits an empty word', {
    target,
    input: '',
    focus: 'typing',
    drawer: false,
  });
  await p.pause();
  await p.resume();
  await p.correctWord('traditional-left-thumb');
  await p.checkpoint('recovered-practice');
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await p.checkpoint('narrow-practice');
  await p.openSettings('keyboard-group');
  expect(
    await page.evaluate(
      () =>
        document.querySelector('#settings')!.scrollWidth <=
        document.querySelector('#settings')!.clientWidth,
    ),
  ).toBe(true);
  await p.checkpoint('narrow-drawer');
});

test('product: delayed capture results cannot revise a settled word or a retried attempt', async ({
  product: p,
  page,
}) => {
  const [first, next] = await page.locator('.passage > span').allTextContents();
  p.events.push({ fixturePolicy: 'traditional explicit letters and thumbs' });
  await p.type(first!, observations(first!));
  await p.pose(' ', 'right-thumb');
  await p.wait(300);
  await p.delayInference(2500);
  await p.wait(50);
  await page.keyboard.press('Space');
  await expect(page.locator('#feedback')).toContainText('Checking fingers');
  await expect(page.locator('#typing')).toBeFocused();
  await page.keyboard.press('x');
  await expect(page.locator('#input-message')).toContainText('not entered while checking');
  await p.check('deadline settles using completed evidence', { target: next, input: '' });
  await p.checkpoint('boundary-settled');
  await p.wait(2700);
  await p.check('late result cannot revise accepted word', { target: next, input: '' });
  await expect(page.locator('.practice-metrics')).toContainText('0 retries');
  await p.delayInference(12);
  await p.press('b', 'left-index');
  await p.pose(' ', 'left-thumb');
  await p.wait(300);
  await p.delayInference(2500);
  await page.keyboard.press('Space');
  await expect(page.locator('#retry')).toBeVisible();
  await p.retry();
  await p.delayInference(12);
  await p.press(next![0]!, observations(next![0]!)[0]!);
  await p.wait(2700);
  await p.check('late failed-attempt result cannot overwrite retry input', {
    target: next,
    input: next![0],
    focus: 'typing',
  });
  await expect(page.locator('.practice-metrics')).toContainText('1 retries');
});

test('product: complete exercise, inspect history, continue and reload saved curriculum', async ({
  product: p,
  page,
}) => {
  const rounds = Number(process.env.PRODUCT_EXERCISES ?? 1);
  test.setTimeout(30000 + 120000 * rounds);
  const calibration = (await p.persisted()).calibration;
  const first = await p.target();
  await p.press(first[0]!, observations(first[0]!)[0]!);
  await p.pause();
  await p.resume();
  const exactWordBound = await page.locator('.passage > span').count();
  expect(exactWordBound).toBe(12);
  await p.session(rounds, 'traditional-right-thumb', exactWordBound);
  await expect(page.locator('#feedback')).toContainText('Round complete');
  const saved = await p.persisted();
  expect(saved.results).toHaveLength(rounds);
  expect(saved.results.at(-1)).toMatchObject({ uncertainPresses: 0, wrongFingers: 0, retries: 0 });
  expect((await p.progress()).cohorts[0].course.sequence).toBe(rounds + 1);
  await p.openSettings('history-group');
  await expect(page.locator('#history-list')).toContainText('0 retries');
  await p.resume();
  await p.target();
  await p.check('next round begins with empty focused entry', { input: '', focus: 'typing' });
  await expect(page.locator('#round-focus')).toContainText(`Round ${rounds + 1}`);
  const nextWords = await page.locator('.passage > span').allTextContents();
  const expectedTotal = (await p.progress()).cohorts[0].total + nextWords[0]!.length + 1;
  await p.correctWord('traditional-left-thumb');
  await expect
    .poll(async () => {
      const current = (await p.progress()).cohorts[0] as Cohort;
      return (
        current.total === expectedTotal &&
        Object.values(current.actual).every((a) => a.observed + a.unknown === a.total)
      );
    })
    .toBe(true);
  const progress = await p.progress();
  await p.reload();
  await p.check('reload restarts the saved generated round', {
    target: nextWords[0],
    input: '',
    focus: 'typing',
  });
  expect(await page.locator('.passage > span').allTextContents()).toEqual(nextWords);
  expect((await p.persisted()).calibration.points).toEqual(calibration.points);
  expect((await p.persisted()).results).toEqual(saved.results);
  expect((await p.progress()).cohorts).toEqual(progress.cohorts);
});

test('product: incomplete exercise bounds fail without skipping words', async ({
  product: p,
  page,
}) => {
  const next = (await page.locator('.passage > span').allTextContents())[1];
  await expect(p.exercise('traditional-right-thumb', 1)).rejects.toThrow(
    'Exercise did not complete within 1 words',
  );
  await p.check('only the permitted first word was completed', {
    target: next,
    input: '',
    focus: 'typing',
  });
});

import { test, expect } from './product-driver';

// These run in ordinary pnpm test:e2e / required Verify CI with isolated contexts.
test('product: explicit fingers, retries, correction and honest unknown coverage', async ({
  product: p,
  page,
}) => {
  await p.check('fresh target has focus', { target: 'a', input: '', focus: 'typing' });
  await p.press('b', 'left-index');
  await p.submit('left-thumb');
  await expect(page.locator('#feedback')).toContainText('text did not match');
  await p.check('typo remains available to retry', { target: 'a', input: 'b', focus: 'typing' });
  await p.retry();
  await p.press('a', 'left-index', { code: 'KeyA' });
  await p.backspace();
  await p.press('a', 'unknown');
  await p.submit('unknown');
  await expect(page.locator('#feedback')).toContainText('saw left index');
  await expect(page.locator('#feedback')).toContainText('could not verify 2 presses');
  await p.check('backspace retains wrong-finger evidence', { target: 'a', input: 'a' });
  await p.checkpoint('erased-wrong-finger-retry');
  await p.retry();
  await p.press('a', 'right-index');
  await p.submit('right-thumb');
  await expect(page.locator('#feedback')).toContainText('saw right index');
  await p.retry();
  await p.type('a', ['unknown']);
  await p.submit('unknown');
  await p.check('unknown advances rather than masquerading as correct evidence', {
    target: 'quick',
    input: '',
    focus: 'typing',
  });
  await expect(page.locator('#feedback')).toContainText('could not verify 2 presses');
  await p.type('quick', [
    'left-little',
    'right-index',
    'right-middle',
    'left-middle',
    'right-middle',
  ]);
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
  await p.type('qu', ['left-little', 'right-index']);
  const keyboard = await page.locator('#finger-map').boundingBox();
  await p.openSettings('keyboard-group');
  expect(await page.locator('#finger-map').boundingBox()).toEqual(keyboard);
  await page.locator('#custom-layout').click();
  await page.locator('#profile-name').fill('Synthetic draft');
  await page.keyboard.press('Space');
  await p.closeSettings();
  await p.check('closing does not resume or steal opener focus', {
    target: 'quick',
    input: 'qu',
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
    target: 'quick',
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
  await p.press('a', 'left-little');
  await p.pose(' ', 'right-thumb');
  await p.wait(300);
  await p.delayInference(2500);
  await p.wait(50);
  await page.keyboard.press('Space');
  await expect(page.locator('#feedback')).toContainText('Checking fingers');
  await expect(page.locator('#typing')).toBeFocused();
  await page.keyboard.press('x');
  await expect(page.locator('#input-message')).toContainText('not entered while checking');
  await p.check('deadline settles using completed evidence', { target: 'quick', input: '' });
  await p.checkpoint('boundary-settled');
  await p.wait(2700);
  await p.check('late result cannot revise accepted word', { target: 'quick', input: '' });
  await expect(page.locator('.practice-metrics')).toContainText('0 retries');
  await p.delayInference(12);
  await p.press('a', 'left-little');
  await p.pose(' ', 'left-thumb');
  await p.wait(300);
  await p.delayInference(2500);
  await page.keyboard.press('Space');
  await expect(page.locator('#retry')).toBeVisible();
  await p.retry();
  await p.delayInference(12);
  await p.press('q', 'left-little');
  await p.wait(2700);
  await p.check('late failed-attempt result cannot overwrite retry input', {
    target: 'quick',
    input: 'q',
    focus: 'typing',
  });
  await expect(page.locator('.practice-metrics')).toContainText('1 retries');
});

test('product: complete exercise, inspect history, restart and reload a real saved setup', async ({
  product: p,
  page,
}) => {
  const rounds = Number(process.env.PRODUCT_EXERCISES ?? 1);
  test.setTimeout(30000 + 120000 * rounds);
  const calibration = (await p.persisted()).calibration;
  // Earlier pause is deliberate: completion must recover even after a resumed attempt.
  await p.press('a', 'left-little');
  await p.pause();
  await p.resume();
  await p.session(rounds, 'traditional-right-thumb');
  await expect(page.locator('#feedback')).toContainText('Passage complete');
  const saved = await p.persisted();
  expect(saved.results).toHaveLength(rounds);
  expect(saved.results.at(-1)).toMatchObject({ uncertainPresses: 0, wrongFingers: 0, retries: 0 });
  await p.openSettings('history-group');
  await expect(page.locator('#history-list')).toContainText('0 retries');
  await p.resume();
  await p.check('restart has an active target and empty focused entry', {
    target: 'a',
    input: '',
    focus: 'typing',
  });
  await p.correctWord('traditional-left-thumb');
  await p.reload();
  await p.check('saved setup restarts a fresh exercise on reload', {
    target: 'a',
    input: '',
    focus: 'typing',
  });
  expect((await p.persisted()).calibration.points).toEqual(calibration.points);
  expect((await p.persisted()).results).toEqual(saved.results);
});

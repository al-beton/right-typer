import { test, expect } from '@playwright/test';
import { setup, syntheticCamera, word } from './helpers';
import { calibration } from '../tests/fixtures';

test('mapping hands focus to Start without consuming activation as a typing press', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.goto('/');
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  await page.evaluate(() => {
    window.__hands = [];
  });
  await page.getByRole('button', { name: 'Map keys', exact: true }).click();
  await expect(page.locator('#overlay')).toBeFocused();
  for (const point of Object.values(calibration().points)) {
    const box = await page.locator('#overlay').boundingBox();
    await page
      .locator('#overlay')
      .click({ position: { x: point.x * box!.width, y: point.y * box!.height } });
  }
  const start = page.getByRole('button', { name: 'Start practice', exact: true });
  await expect(start).toBeFocused();
  await expect(page.locator('#mapping-editor')).toBeHidden();
  await expect(page.locator('#typing')).toBeDisabled();
  await start.press('Space');
  await expect(page.locator('#typing')).toBeFocused();
  await expect(page.locator('#typing')).toHaveValue('');
  await expect(page.locator('.practice-metrics')).toContainText('0 retries');
  await page.locator('#typing').press('a');
  await page.locator('#typing').press('Space');
  await expect(page.locator('.target-word')).toHaveText('quick');
  await expect(page.locator('#feedback')).toContainText('could not verify');
});

test('pause preserves progress, rejects detached input and keeps mapping out of the resume path', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  await word(page, 'a');
  const previousInput = await page.locator('#typing').elementHandle();
  await page.locator('#typing').press('Escape');
  await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeFocused();
  await expect(page.locator('#mapping-editor')).toBeHidden();
  await previousInput!.evaluate((el) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true })),
  );
  await page.getByRole('button', { name: 'Resume practice', exact: true }).press('Enter');
  await expect(page.locator('#typing')).toBeFocused();
  await expect(page.locator('#typing')).toHaveValue('');
  await expect(page.locator('.target-word')).toHaveText('quick');
  await expect(page.locator('.practice-metrics')).toContainText('1 /');
  await page.getByRole('button', { name: 'Edit setup', exact: true }).click();
  await expect(page.locator('#mapping-editor')).toBeVisible();
  await expect(page.locator('#overlay')).toBeFocused();
  await page.getByRole('button', { name: 'Map q', exact: true }).click();
  await expect(page.locator('#overlay')).toBeFocused();
  await page.locator('#overlay').press('ArrowRight');
  await page.locator('#overlay').press('Enter');
  await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeFocused();
  await expect(page.locator('#typing')).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toBeEnabled();
  await expect(page.locator('#typing')).toBeDisabled();
});

test('boundary completion preserves focus in controls and editor keys never enter practice', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  await page.evaluate(() => {
    window.__inferenceDelay = 2000;
  });
  await page.locator('#typing').pressSequentially('a ');
  await page.locator('#camera-rotation').focus();
  await expect(page.locator('#feedback')).not.toContainText('Checking fingers');
  await expect(page.locator('#camera-rotation')).toBeFocused();
  await page.locator('#camera-rotation').press('a');
  await expect(page.locator('#typing')).toHaveValue('');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.evaluate(() => {
    const editor = document.createElement('div');
    editor.dataset.keyboardEditor = '';
    editor.innerHTML = '<input aria-label="Custom key capture">';
    document.body.append(editor);
  });
  await page.getByLabel('Custom key capture').fill('a');
  await page.getByLabel('Custom key capture').press('Space');
  await expect(page.locator('#diagnostic-result')).toHaveText(
    'Press a key to check its observed finger.',
  );
  await expect(page.getByLabel('Custom key capture')).toHaveValue('a ');
});

test('invalid full mapping cannot start and narrow transitions keep centered geometry', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto('/');
  await expect(page.locator('#camera-badge')).toContainText('hands detected');
  const positions = () =>
    page.evaluate(() =>
      ['#finger-map', '#view-wrap'].map((s) => {
        const r = document.querySelector(s)!.getBoundingClientRect();
        return { top: r.top + scrollY, left: r.left, width: r.width, height: r.height };
      }),
    );
  const initial = await positions();
  for (let i = 0; i < 30; i++)
    await page.locator('#overlay').click({ position: { x: 100, y: 100 } });
  await expect(page.locator('#ready-message')).toContainText('overlapping dots');
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toBeDisabled();
  expect(await positions()).toEqual(initial);
  await page.getByRole('button', { name: 'Remap key positions' }).click();
  for (const point of Object.values(calibration().points)) {
    const box = await page.locator('#overlay').boundingBox();
    await page
      .locator('#overlay')
      .click({ position: { x: point.x * box!.width, y: point.y * box!.height } });
  }
  await page.screenshot({ path: 'test-results/flow-ready-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  expect(await positions()).toEqual(initial);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(await positions()).toEqual(initial);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/flow-paused-390.png', fullPage: true });
});

for (const control of ['Pause', 'Edit setup']) {
  test(`settlement retains keyboard focus on ${control}`, async ({ page }) => {
    await syntheticCamera(page);
    await setup(page);
    await page.evaluate(() => {
      window.__inferenceDelay = 2000;
    });
    await page.locator('#typing').pressSequentially('a ');
    const button = page.getByRole('button', { name: control, exact: true });
    await button.focus();
    await expect(page.locator('#feedback')).not.toContainText('Checking fingers');
    await expect(button).toBeFocused();
    await button.press('Space');
    await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeEnabled();
    await expect(page.locator('#typing')).toBeDisabled();
  });
}

test('Retry button hands focus back to typing for the next physical keypress', async ({ page }) => {
  await syntheticCamera(page);
  await setup(page);
  for (const activation of ['click', 'Space']) {
    await page.keyboard.type('b ');
    const retry = page.getByRole('button', { name: 'Retry word' });
    await expect(retry).toBeVisible();
    if (activation === 'click') await retry.click();
    else {
      await retry.focus();
      await page.keyboard.press('Space');
    }
    await expect(page.locator('#typing')).toBeFocused();
    await page.keyboard.type('a');
    await expect(page.locator('#typing')).toHaveValue('a');
    await page.keyboard.press('Backspace');
  }
});

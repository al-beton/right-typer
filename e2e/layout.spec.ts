import { test, expect } from '@playwright/test';
import { syntheticCamera, press, word } from './helpers';
import { calibration, handsAt } from '../tests/fixtures';

test('one stable page from camera off through mapping, optional test, retry and setup edits', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.goto('/');
  const positions = () =>
    page.evaluate(() =>
      ['#finger-map', '#view-wrap'].map((selector) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return { top: r.top + window.scrollY, left: r.left, width: r.width, height: r.height };
      }),
    );
  const initial = await positions();
  const go = page.getByRole('button', { name: 'Go', exact: true });
  await expect(go).toBeDisabled();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/single-page-initial.png', fullPage: true });
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await expect(page.locator('#requested-key')).toHaveText('Mark q in the image');
  // No hands at all: setup completion is independent of inference confidence/visibility.
  await page.evaluate(() => {
    window.__hands = [];
  });
  const points = Object.values(calibration().points);
  for (const [i, point] of points.entries()) {
    await expect(go).toBeDisabled();
    const canvas = page.locator('#overlay');
    const box = await canvas.boundingBox();
    await canvas.click({ position: { x: point.x * box!.width, y: point.y * box!.height } });
    expect(await positions(), `key ${i}`).toEqual(initial);
  }
  await expect(page.locator('#camera-badge')).toContainText('0 hands detected');
  await expect(go).toBeEnabled();
  await page.evaluate(
    (hands) => {
      window.__hands = hands;
    },
    handsAt('f', 'left-index'),
  );
  await page.waitForTimeout(150);
  await page.locator('#diagnostic-input').press('f');
  await expect(page.locator('#diagnostic-result')).toContainText('saw left index');
  await page.screenshot({ path: 'test-results/single-page-mapped-synthetic.png', fullPage: true });
  await go.click();
  await expect(page.locator('.next-key')).toHaveAttribute('data-key', 'a');
  expect(await positions()).toEqual(initial);
  await press(page, 'a', 'left-index');
  await press(page, ' ');
  await expect(page.locator('#feedback')).toContainText('saw left index');
  expect(await positions()).toEqual(initial);
  await page.locator('#typing').press('Enter');
  await expect(page.locator('.next-key')).toHaveAttribute('data-key', 'a');
  await word(page, 'a');
  await expect(page.locator('.target-word')).toHaveText('quick');
  await expect(page.locator('.next-key')).toHaveAttribute('data-key', 'q');
  expect(await positions()).toEqual(initial);
  await page.getByRole('button', { name: 'Edit setup' }).click();
  await expect(page.locator('.next-key')).toHaveCount(0);
  await expect(go).toBeEnabled();
  await page.getByRole('button', { name: 'Map q', exact: true }).click();
  const oldQ = calibration().points.q!;
  await page.locator('#overlay').focus();
  await page.locator('#overlay').press('ArrowRight');
  await go.click();
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration,
  );
  expect(stored.points.q.x).toBeCloseTo(oldQ.x + 0.005, 2);
  expect(await positions()).toEqual(initial);
});

import { test, expect } from '@playwright/test';

test('selected wordmark and favicon are the normal app defaults', async ({ page }) => {
  await page.goto('./');
  const heading = page.getByRole('heading', { name: 'Right Typer', exact: true });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveText('Right Typer');
  const colours = await page
    .locator('.physical-position')
    .evaluateAll((positions) =>
      positions
        .filter((p) =>
          'QWERTYUIOP'.split('').some((letter) => p.querySelector(`[data-key=Key${letter}]`)),
        )
        .map((p) => getComputedStyle(p.firstElementChild!).backgroundColor),
    );
  const letters = heading.locator('span[style]');
  expect(
    await letters.evaluateAll((es) => es.map((e) => getComputedStyle(e).textDecorationColor)),
  ).toEqual(colours);
  expect(await letters.allTextContents()).toEqual([...'RightTyper']);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const logo = await heading.boundingBox();
    const source = await page.locator('#settings-open').boundingBox();
    expect(logo!.x + logo!.width).toBeLessThan(source!.x);
    expect(await heading.evaluate((e) => getComputedStyle(e).fontSize)).toBe('22px');
  }
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
    'href',
    './favicon.svg?v=quiet-underline-type',
  );
  const svg = await page.request.get('favicon.svg?v=quiet-underline-type');
  expect(svg.ok()).toBe(true);
  expect(await svg.text()).toContain('Right Typer rt favicon');
  const ico = await page.request.get('favicon.ico?v=quiet-underline-type');
  expect(ico.ok()).toBe(true);
  const bytes = await ico.body();
  expect(bytes.readUInt16LE(2)).toBe(1);
  expect(bytes.readUInt16LE(4)).toBe(3);
  expect([bytes[6], bytes[22], bytes[38]]).toEqual([16, 32, 48]);
});

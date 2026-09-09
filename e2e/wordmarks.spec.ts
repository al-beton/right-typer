import { test, expect } from '@playwright/test';

test('review sequence matches all ten rendered keyboard columns, including both index columns', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.physical-position').first()).toBeVisible();
  const colours = await page
    .locator('.physical-position')
    .evaluateAll((positions) =>
      positions
        .filter((p) => (p as HTMLElement).style.top === '0%')
        .map((p) => getComputedStyle(p.firstElementChild!).backgroundColor),
    );
  expect(colours).toHaveLength(10);
  await page.goto('/wordmarks.html');
  await expect(page.locator('.wm-card')).toHaveCount(3);
  const letters = page.locator('.wm-large .wm-seq .wm-letter');
  expect(await letters.evaluateAll((es) => es.map((e) => getComputedStyle(e).color))).toEqual(
    colours,
  );
  expect(await letters.allTextContents()).toEqual([...'RightTyper']);
  await page.getByLabel('Display text').selectOption('Bright Typer');
  expect(await letters.evaluateAll((es) => es.map((e) => getComputedStyle(e).color))).toEqual([
    colours[0],
    ...colours,
  ]);
  await page.getByLabel('Add thumb colours in the word gap').check();
  expect(await letters.evaluateAll((es) => es.map((e) => getComputedStyle(e).color))).toEqual([
    colours[0],
    ...colours,
  ]);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      await page
        .locator('.wm-large .wordmark')
        .evaluateAll((es) =>
          es.every(
            (e) =>
              e.getBoundingClientRect().right <=
              e.closest('.wm-card')!.getBoundingClientRect().right,
          ),
        ),
    ).toBe(true);
  }
});

test('favicon selection updates the real icon, survives reload, and leaves normal app defaults intact', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, '__galleryCameraCalls', { value: 0, writable: true });
    navigator.mediaDevices.getUserMedia = async () => {
      (window as unknown as { __galleryCameraCalls: number }).__galleryCameraCalls++;
      throw new Error('Camera should not start in review');
    };
  });
  await page.goto('/wordmarks.html');
  for (const id of ['rt', 'split', 'key']) {
    await page.locator(`[data-icon="${id}"]`).click();
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      'href',
      new RegExp(`/wordmarks/${id}\\.32\\.png\\?v=`),
    );
    await expect(page.locator(`[data-icon="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(`[data-icon="${id}"]`)).toBeFocused();
    for (const suffix of ['svg', '16.png', '32.png', '48.png', 'ico']) {
      const response = await page.request.get(`/wordmarks/${id}.${suffix}`);
      expect(response.ok()).toBe(true);
      const bytes = await response.body();
      if (suffix === 'ico') {
        expect(bytes.readUInt16LE(2)).toBe(1);
        expect(bytes.readUInt16LE(4)).toBe(3);
        expect([bytes[6], bytes[22], bytes[38]]).toEqual([16, 32, 48]);
      } else if (suffix.endsWith('.png')) {
        expect(bytes.readUInt32BE(16)).toBe(Number(suffix.split('.')[0]));
        expect(bytes.readUInt32BE(20)).toBe(Number(suffix.split('.')[0]));
      }
    }
  }
  await page.locator('[data-style="seq"]').click();
  await expect(page.locator('#wm-chosen .wm-seq')).toBeVisible();
  await expect(page.locator('[data-style="seq"]')).toBeFocused();
  await page.reload();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    /\/wordmarks\/key\.32\.png\?v=/,
  );
  await expect(page.locator('#wm-chosen .wm-seq')).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __galleryCameraCalls: number }).__galleryCameraCalls,
    ),
  ).toBe(0);
  expect(errors).toEqual([]);
  await page.getByRole('link', { name: 'Back to app' }).click();
  await expect(page.locator('h1')).toHaveText('Right Typer');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', './favicon.svg');
});

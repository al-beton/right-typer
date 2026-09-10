import { test, expect } from '@playwright/test';
import { syntheticCamera } from './helpers';
import { PRESETS, calibrationCodes } from '../src/core/profile';
import fs from 'node:fs';

// Literal manufacturer reference anchors, independent of the renderer.
const references = [
  ['us-ansi', 6.25, 2.25, 2.25, 2.75, 1, '@', '\\', ';'],
  ['gb-iso', 6.25, 2.25, 1.25, 2.75, 2, '"', '#', ';'],
  ['apple-gb-iso', 5, 2.75, 1.25, 2.25, 2, '@', '\\', ';'],
  ['de-iso', 6.25, 2.25, 1.25, 2.75, 2, '"', '#', 'Ö'],
  ['fr-iso', 6.25, 2.25, 1.25, 2.75, 2, '2', '*', 'M'],
  ['apple-us-ansi', 5, 2.75, 2.25, 2.25, 1, '@', '\\', ';'],
] as const;
for (const [
  id,
  spaceWidth,
  spaceX,
  leftShift,
  rightShift,
  enterHeight,
  shifted2,
  backslash,
  semicolon,
] of references)
  test(`${id}: fresh and saved desktop/mobile hardware fidelity`, async ({ page }) => {
    await syntheticCamera(page);
    await page.goto('./');
    await page.locator('#keyboard-profile').selectOption(id);
    const p = PRESETS.find((p) => p.id === id)!;
    await expect(page.locator('#camera-badge')).toContainText('hands detected');
    // Exercise the real setup UI for each profile, including French's different targets.
    for (const code of calibrationCodes(p)) {
      const k = p.keys.find((k) => k.code === code);
      const pt =
        code === 'space-left'
          ? { x: 0.25, y: 0.85 }
          : code === 'space-right'
            ? { x: 0.65, y: 0.85 }
            : { x: 0.1 + k!.x * 0.07, y: 0.2 + k!.y * 0.2 };
      const box = (await page.locator('#overlay').boundingBox())!;
      await page
        .locator('#overlay')
        .click({ position: { x: pt.x * box.width, y: pt.y * box.height } });
    }
    await page.locator('#practice').click();
    await expect(page.locator('#typing')).toBeEnabled();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!));
    for (const route of ['fresh', 'saved']) {
      if (route === 'saved') {
        await page.reload();
        await expect(page.locator('#typing')).toBeEnabled();
        const restored = await page.evaluate(() =>
          JSON.parse(localStorage.getItem('right-typer.v1')!),
        );
        expect(restored.calibration.points).toEqual(saved.calibration.points);
        expect(restored.calibration.deviceId).toEqual(saved.calibration.deviceId);
        expect(restored.calibration.profile).toEqual(saved.calibration.profile);
      }
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1100 });
        const rect = async (code: string) =>
          (await page.locator(`[data-key="${code}"]`).boundingBox())!;
        const q = await rect('KeyQ'),
          w = await rect('KeyW'),
          a = await rect('KeyA'),
          z = await rect('KeyZ'),
          space = await rect('Space');
        const unit = w.x - q.x,
          gutter = unit - q.width;
        const size = async (code: string) => ((await rect(code)).width + gutter) / unit;
        expect((a.x - q.x) / unit).toBeCloseTo(0.25, 2);
        expect((z.x - q.x) / unit).toBeCloseTo(0.75, 2);
        expect((space.x - q.x) / unit).toBeCloseTo(spaceX, 2);
        expect(await size('Space')).toBeCloseTo(spaceWidth, 2);
        expect(await size('ShiftLeft')).toBeCloseTo(leftShift, 2);
        expect(await size('ShiftRight')).toBeCloseTo(rightShift, 2);
        expect(((await rect('Enter')).height + gutter) / unit).toBeCloseTo(enterHeight, 2);
        await expect(page.locator('[data-key=Digit2] .legend-1')).toHaveText(shifted2);
        await expect(page.locator('[data-key=Backslash] .legend-0')).toHaveText(backslash);
        await expect(page.locator('[data-key=Semicolon] .legend-0')).toHaveText(semicolon);
        await expect(page.locator('[data-key=Space] b')).toBeEmpty();
        await expect(page.locator('[data-key=Space] small')).toHaveText('either thumb');
        for (const key of ['KeyF', 'KeyJ'])
          expect(
            await page
              .locator(`[data-key=${key}]`)
              .evaluate((e) => getComputedStyle(e, '::after').content),
          ).toBe('""');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        if (id === 'de-iso')
          for (const [code, symbol] of [
            ['KeyQ', '@'],
            ['KeyE', '€'],
            ['KeyM', 'µ'],
          ]) {
            await expect(page.locator(`[data-key=${code}] .legend-0`)).toHaveText(code!.slice(3));
            await expect(page.locator(`[data-key=${code}] .legend-2`)).toHaveText(symbol!);
          }
        if (width === 1440)
          for (const key of ['KeyF', 'KeyJ']) {
            const gap = await page.locator(`[data-key=${key}]`).evaluate((e) => {
              const rect = e.getBoundingClientRect(),
                ridge = getComputedStyle(e, '::after');
              return (
                rect.bottom -
                parseFloat(ridge.bottom) -
                parseFloat(ridge.height) -
                e.querySelector('small')!.getBoundingClientRect().bottom
              );
            });
            expect(gap).toBeGreaterThan(4);
          }
        fs.mkdirSync('/tmp/alo265/evidence', { recursive: true });
        await page
          .locator('#finger-map')
          .screenshot({ path: `/tmp/alo265/evidence/${id}-${route}-${width}.png` });
      }
    }
  });

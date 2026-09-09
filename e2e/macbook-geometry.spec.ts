import { test, expect } from '@playwright/test';
import { syntheticCamera } from './helpers';
import { PRESETS } from '../src/core/profile';
import { calibration } from '../tests/fixtures';

test('visible MacBook spacebar edges match C–M on desktop and mobile; PC/custom retain geometry', async ({
  page,
}) => {
  await syntheticCamera(page);
  const custom = structuredClone(PRESETS[0]!);
  custom.id = 'custom-geometry';
  custom.name = 'Custom split';
  custom.keys.find((k) => k.code === 'Space')!.x = 1.125;
  custom.keys.find((k) => k.code === 'Space')!.width = 3.5;
  await page.addInitScript(
    (p) =>
      localStorage.setItem(
        'right-typer.v1',
        JSON.stringify({ profileId: p.id, customProfiles: [p] }),
      ),
    custom,
  );
  await page.goto('/');
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const p of [...PRESETS, custom]) {
      await page.locator('#keyboard-profile').selectOption(p.id);
      const rect = async (code: string) =>
        (await page.locator(`[data-key="${code}"]`).boundingBox())!;
      const space = await rect('Space'),
        c = await rect('KeyC'),
        m = await rect('KeyM');
      if (p.id.startsWith('apple-')) {
        expect(Math.abs(space.x - c.x)).toBeLessThan(0.1);
        expect(Math.abs(space.x + space.width - m.x - m.width)).toBeLessThan(0.1);
      } else {
        const q = await rect('KeyQ'),
          w = await rect('KeyW');
        const unit = w.x - q.x;
        const key = p.keys.find((k) => k.code === 'Space')!;
        expect(Math.abs(space.x - q.x - key.x * unit)).toBeLessThan(0.1);
        expect(Math.abs(space.width - (q.width + (key.width - 1) * unit))).toBeLessThan(0.1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.locator('#keyboard-profile').selectOption('apple-us-ansi');
    if ([1440, 390].includes(width))
      await page.screenshot({ path: `/tmp/alo264-${width}.png`, fullPage: true });
  }
});

test('old camera setup stays usable; corrected preset requires a fresh map and old setup remains selectable', async ({
  page,
}) => {
  await syntheticCamera(page);
  await page.addInitScript(
    (c) =>
      localStorage.setItem(
        'right-typer.v1',
        JSON.stringify({
          calibration: { ...c, deviceId: 'synthetic-macbook-camera' },
          practiceEnabled: true,
        }),
      ),
    calibration(),
  );
  await page.goto('/');
  await expect(page.locator('#keyboard-profile')).toHaveValue('saved-apple-gb-iso');
  await expect(page.locator('#typing')).toBeEnabled();
  await page.locator('#keyboard-profile').selectOption('apple-gb-iso');
  await expect(page.locator('#practice')).toBeDisabled();
  await page.locator('#keyboard-profile').selectOption('saved-apple-gb-iso');
  await expect(page.locator('#practice')).toBeEnabled();
});

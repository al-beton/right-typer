import { test, expect } from '@playwright/test';
import { syntheticCamera } from './helpers';
import oldSaved from '../tests/fixtures/alo264-british-pre34.json' with { type: 'json' };
import { PRESETS } from '../src/core/profile';

for (const variant of ['pre34', 'pr34', 'pc', 'custom'] as const)
  test(`saved ${variant} geometry upgrade preserves camera data and refresh continuity`, async ({
    page,
  }) => {
    await syntheticCamera(page);
    const initial = {
      ...structuredClone(oldSaved),
      customProfiles: [] as Array<typeof oldSaved.calibration.profile>,
    };
    if (variant === 'pr34' || variant === 'custom') {
      const p = {
        ...structuredClone(initial.calibration.profile),
        id: 'saved-apple-gb-iso',
        name: 'MacBook British — saved geometry',
      };
      if (variant === 'custom') p.keys.find((k) => k.code === 'Space')!.width = 3.25;
      initial.profileId = p.id;
      initial.customProfiles = [p];
      initial.calibrations = { [p.id]: initial.calibration } as typeof initial.calibrations;
      if (variant === 'custom') initial.calibration.profile = p;
    } else if (variant === 'pc') {
      const p = structuredClone(PRESETS[0]!);
      p.keys.find((k) => k.code === 'Space')!.x = 2;
      p.keys.find((k) => k.code === 'Space')!.width = 6;
      initial.profileId = p.id;
      initial.calibration.profile = p;
      initial.calibrations = { [p.id]: initial.calibration } as typeof initial.calibrations;
    }
    await page.addInitScript((data) => {
      if (!localStorage.getItem('right-typer.v1'))
        localStorage.setItem('right-typer.v1', JSON.stringify(data));
    }, initial);
    await page.goto('./');
    await expect(page.locator('#typing')).toBeEnabled();
    const expected =
      variant === 'pc' ? 'us-ansi' : variant === 'custom' ? 'saved-apple-gb-iso' : 'apple-gb-iso';
    await expect(page.locator('#keyboard-profile')).toHaveValue(expected);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      const bounds = await page.locator('[data-key]').evaluateAll((es) =>
        Object.fromEntries(
          es
            .filter((e) => ['KeyC', 'KeyM', 'Space'].includes(e.getAttribute('data-key')!))
            .map((e) => {
              const r = e.getBoundingClientRect();
              return [e.getAttribute('data-key'), { left: r.left, right: r.right }];
            }),
        ),
      );
      if (variant === 'pre34' || variant === 'pr34') {
        expect(Math.abs(bounds.Space!.left - bounds.KeyC!.left)).toBeLessThan(0.1);
        expect(Math.abs(bounds.Space!.right - bounds.KeyM!.right)).toBeLessThan(0.1);
        if (variant === 'pre34') {
          console.log(JSON.stringify({ variant, width, bounds }));
          await page
            .locator('#finger-map')
            .screenshot({ path: `/tmp/geometry-after-${width}.png` });
        }
      }
    }
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!));
    const saved = await read();
    expect(saved.calibration.points).toEqual(initial.calibration.points);
    expect(saved.calibration.deviceId).toBe(initial.calibration.deviceId);
    expect(saved.calibration.swapHands).toBe(initial.calibration.swapHands);
    if (variant !== 'custom')
      expect(Object.values(saved.calibrationHistory)).toContainEqual(initial.calibration);
    else expect(saved.calibration.profile).toEqual(initial.calibration.profile);
    await page.reload();
    await expect(page.locator('#typing')).toBeEnabled();
    await expect(page.locator('#keyboard-profile')).toHaveValue(expected);
    expect((await read()).calibration.points).toEqual(initial.calibration.points);
    if (variant === 'pc') {
      // User chooses actual hardware: don't infer a MacBook from the browser OS.
      await page.locator('#keyboard-profile').selectOption('apple-gb-iso');
      await expect(page.locator('#practice')).toBeEnabled();
      await page.locator('#practice').click();
      expect((await read()).calibration.points).toEqual(initial.calibration.points);
    }
  });

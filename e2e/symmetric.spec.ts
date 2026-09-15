import { test, expect } from '@playwright/test';
import { syntheticCamera, setup, openSettings, resumePractice, press } from './helpers';

for (const [mode, b] of [
  ['symmetric-left', 'left-index'],
  ['symmetric-right', 'right-index'],
] as const) {
  test(`${mode}: physical zones, correct and wrong observations, reload and camera preservation`, async ({
    page,
  }, info) => {
    await syntheticCamera(page, undefined, true);
    await setup(page, false, '/', true);
    const savedBefore = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('right-typer.v1')!),
    );
    await openSettings(page, 'keyboard-group');
    await expect(page.locator('#fingering-mode option')).toHaveCount(5);
    await page.locator('#fingering-mode').selectOption(mode);
    await expect(page.locator('#fingering-help')).toContainText(`B uses ${b.replace('-', ' ')}`);
    await resumePractice(page);
    for (const [code, finger] of Object.entries({
      KeyZ: 'left ring',
      KeyX: 'left middle',
      KeyC: 'left index',
      KeyB: b.replace('-', ' '),
      KeyE: 'left middle',
      KeyR: 'left index',
      KeyM: 'right index',
      Comma: 'right middle',
      Space: 'either thumb',
      Digit6: 'left index',
      Digit0: 'right ring',
    }))
      await expect(page.locator(`[data-key="${code}"]`)).toHaveAttribute('title', finger);
    await page.screenshot({
      path: `test-results/${mode}-${info.project.name}.png`,
      fullPage: true,
    });
    for (const [key, finger] of [
      ['z', 'left-ring'],
      ['x', 'left-middle'],
      ['c', 'left-index'],
      ['b', b],
      ['e', 'left-middle'],
      ['r', 'left-index'],
      ['m', 'right-index'],
      [',', 'right-middle'],
    ] as const)
      await press(page, key, finger);
    await press(page, ' ');
    await expect(page.locator('.press-result.wrong')).toHaveCount(0);
    await expect(page.locator('.press-result.ok')).toHaveCount(9);
    await page.locator('#retry').click();
    await press(page, 'b', b === 'left-index' ? 'right-index' : 'left-index');
    await press(page, 'z', 'left-little');
    await press(page, 'x', 'left-ring');
    await press(page, 'c', 'left-middle');
    await press(page, ' ');
    await expect(page.locator('.error-key')).toHaveText(['B', 'Z', 'X', 'C']);
    await expect(page.locator('.retry-correction').first()).toContainText(
      `Use: ${b.replace('-', ' ')}`,
    );
    await page.locator('#retry').click();
    await press(page, 'c', 'left-index');
    await page.reload();
    await expect(page.locator('#fingering-mode')).toHaveValue(mode);
    await expect(page.locator('#typing')).toHaveValue('');
    const savedAfter = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('right-typer.v1')!),
    );
    expect({ ...savedAfter.calibration, savedAt: 0 }).toEqual({
      ...savedBefore.calibration,
      savedAt: 0,
    });
    expect(savedAfter.cameraCrops).toEqual(savedBefore.cameraCrops);
    expect(savedAfter.cameraDelays).toEqual(savedBefore.cameraDelays);
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.screenshot({
      path: `test-results/${mode}-narrow-${info.project.name}.png`,
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  });
}

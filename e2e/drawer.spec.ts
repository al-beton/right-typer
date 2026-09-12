import { test, expect } from '@playwright/test';
import { syntheticCamera, setup, openSettings, resumePractice, word } from './helpers';

test('saved practice, modal ownership, explicit resume and preserved custom draft', async ({
  page,
}) => {
  await syntheticCamera(page, []);
  await setup(page);
  await page.reload();
  await expect(page.locator('#typing')).toBeEnabled();
  await page.locator('#typing').pressSequentially('a ');
  await expect(page.locator('.passage .active')).toHaveText('quick');
  const calibration = await page.evaluate(
    () => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration,
  );
  await page.locator('#typing').pressSequentially('qu');
  const before = await page.locator('#finger-map').boundingBox();
  await openSettings(page, 'keyboard-group');
  await expect(page.locator('#typing')).toBeDisabled();
  expect(await page.locator('#finger-map').boundingBox()).toEqual(before);
  await page.locator('#custom-layout').click();
  await page.locator('#profile-name').fill('Private draft');
  await page.locator('#settings-close').click();
  await expect(page.locator('#settings-open')).toBeFocused();
  await expect(page.locator('#typing')).toBeDisabled();
  await openSettings(page, 'keyboard-group');
  await expect(page.locator('#profile-name')).toHaveValue('Private draft');
  await page.locator('#capture-key').press('Escape');
  await expect(page.locator('#profile-editor')).toBeHidden();
  await expect(page.locator('#settings')).toBeVisible();
  await page.locator('#settings-resume').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#settings-close')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#settings-resume')).toBeFocused();
  await page.keyboard.down('Enter');
  await expect(page.locator('#typing')).toBeFocused();
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(page.locator('#typing')).toHaveValue('');
  await expect(page.locator('.passage .active')).toHaveText('quick');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration),
  ).toMatchObject({ points: calibration.points });
  await page.screenshot({ path: 'test-results/alo281/saved-practice.png', fullPage: true });
});

test('diagnostic only owns its focused field and camera mapping stays recoverable', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  await openSettings(page);
  await page.locator('#diagnostic').press('f');
  await expect(page.locator('#diagnostic-result')).toContainText('saw left index');
  await page.locator('#settings-title').focus();
  await page.keyboard.press('a');
  await expect(page.locator('#diagnostic-result')).toContainText('saw left index');
  await page.locator('#edit-map').click();
  await page.getByRole('button', { name: 'Map q', exact: true }).click();
  await page.locator('#overlay').press('ArrowRight');
  await page.locator('#settings-close').click();
  await openSettings(page);
  await expect(page.locator('#mapping-editor')).toBeVisible();
  await expect(page.locator('#overlay')).toHaveClass(/calibrating/);
  await page.screenshot({ path: 'test-results/alo281/drawer.png', fullPage: true });
  await resumePractice(page);
  await word(page, 'a');
  await expect(page.locator('.passage .active')).toHaveText('quick');
});

for (const width of [320, 390, 640])
  test(`contained camera and drawer at ${width}px`, async ({ page }) => {
    await syntheticCamera(page, []);
    await setup(page);
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const angle of [0, 90, 180, 270]) {
      await openSettings(page);
      await page.locator('#camera-rotation').selectOption(String(angle));
      await resumePractice(page);
      const contained = await page.evaluate(() => {
        const stage = document.querySelector('#view-wrap')!.getBoundingClientRect();
        const image = document.querySelector('#camera-image')!.getBoundingClientRect();
        return image.width <= stage.width + 1 && image.height <= stage.height + 1;
      });
      expect(contained).toBe(true);
    }
    await page.screenshot({ path: `test-results/alo281/practice-${width}.png`, fullPage: true });
    await openSettings(page, 'keyboard-group');
    await page.locator('#custom-layout').click();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.querySelector('#settings')!.scrollWidth <=
            document.querySelector('#settings')!.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `test-results/alo281/drawer-${width}.png`, fullPage: true });
  });

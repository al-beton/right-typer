import { test, expect } from '@playwright/test';
import { syntheticCamera, word } from './helpers';
import { calibration } from '../tests/fixtures';

test.describe('camera view rotation', () => {
  for (const angle of [0, 90, 180, 270]) {
    test(`${angle} degrees: map, practise, rotate, reload and reset`, async ({ page }) => {
      await syntheticCamera(page);
      await page.goto('/');
      await expect(page.locator('#camera-badge')).toContainText('hands detected');
      const rotation = page.getByLabel('Rotate camera view');
      const stage = page.locator('#view-wrap');
      const documentBox = () =>
        stage.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height };
        });
      const initial = await documentBox();
      await rotation.selectOption(String(angle));
      expect(await documentBox()).toEqual(initial);
      for (const point of Object.values(calibration().points)) {
        const [x, y] =
          angle === 90
            ? [1 - point.y, point.x]
            : angle === 180
              ? [1 - point.x, 1 - point.y]
              : angle === 270
                ? [point.y, 1 - point.x]
                : [point.x, point.y];
        const canvas = page.locator('#overlay');
        await canvas.scrollIntoViewIfNeeded();
        const box = (await canvas.boundingBox())!;
        await page.mouse.click(box.x + x * box.width, box.y + y * box.height);
      }
      await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeEnabled();
      // Video and calibration overlays undergo precisely the same transform.
      const videoBox = (await page.locator('#camera').boundingBox())!;
      const canvasBox = (await page.locator('#overlay').boundingBox())!;
      expect(canvasBox).toEqual(videoBox);
      expect(canvasBox.width / canvasBox.height).toBeCloseTo(angle % 180 ? 3 / 4 : 4 / 3, 2);
      await page.screenshot({
        path: `test-results/rotation-${angle}-synthetic.png`,
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Go', exact: true }).click();
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!));
      expect(stored.cameraRotation).toBe(angle);
      for (const [key, point] of Object.entries(calibration().points)) {
        // Browser pointer events round to CSS pixels; bound the native-coordinate error to one displayed pixel.
        expect(
          Math.abs(stored.calibration.points[key].x - point.x) *
            (angle % 180 ? canvasBox.height : canvasBox.width),
        ).toBeLessThanOrEqual(1.01);
        expect(
          Math.abs(stored.calibration.points[key].y - point.y) *
            (angle % 180 ? canvasBox.width : canvasBox.height),
        ).toBeLessThanOrEqual(1.01);
      }
      await word(page, 'a');
      await expect(page.locator('.target-word')).toHaveText('quick');
      // Rotation during practice must not restart tracking or discard the current word.
      await page.locator('#typing').press('q');
      await rotation.selectOption(String((angle + 90) % 360));
      await expect(page.locator('#typing')).toHaveValue('q');
      expect(await page.evaluate(() => window.__terminated)).toBe(0);
      expect(await documentBox()).toEqual(initial);
      await page.reload();
      await expect(page.locator('#setup-message')).toContainText('Saved positions loaded');
      await expect(rotation).toHaveValue(String((angle + 90) % 360));
      await expect(page.getByRole('button', { name: 'Go', exact: true })).toBeEnabled();
      if (angle === 90) {
        await page.setViewportSize({ width: 640, height: 1000 });
        await expect
          .poll(async () => (await stage.boundingBox())!.width)
          .toBeLessThan(initial.width);
        await expect
          .poll(async () => {
            const a = (await stage.boundingBox())!,
              b = (await page.locator('#camera').boundingBox())!;
            return Math.abs(a.x + a.width / 2 - b.x - b.width / 2);
          })
          .toBeLessThan(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      // Restore this angle and verify screen-right arrow nudges the intended native axis.
      await rotation.selectOption(String(angle));
      await page.getByRole('button', { name: 'Map q', exact: true }).click();
      await page.locator('#overlay').press('ArrowRight');
      await page.getByRole('button', { name: 'Go', exact: true }).click();
      const q = await page.evaluate(
        () => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration.points.q,
      );
      const [dx, dy] =
        angle === 90
          ? [0, -0.005]
          : angle === 180
            ? [-0.005, 0]
            : angle === 270
              ? [0, 0.005]
              : [0.005, 0];
      expect(q.x).toBeCloseTo(stored.calibration.points.q.x + dx, 8);
      expect(q.y).toBeCloseTo(stored.calibration.points.q.y + dy, 8);
      await page.getByRole('button', { name: 'Reset local data' }).click();
      await page.getByRole('button', { name: 'Confirm reset' }).click();
      await expect(rotation).toHaveValue('0');
      expect(await page.evaluate(() => localStorage.getItem('right-typer.v1'))).toBeNull();
    });
  }
});

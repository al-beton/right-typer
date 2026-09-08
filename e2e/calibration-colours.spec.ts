import { test, expect } from '@playwright/test';
import { syntheticCamera, setup } from './helpers';
import { allowedFingers, type FingeringMode } from '../src/core/keyboard';
import { orderedFingers } from '../src/view/finger-colours';

test('camera dots match keyboard policy, retain sizes and keep halves upright at every rotation', async ({
  page,
}) => {
  await syntheticCamera(page);
  await setup(page);
  await page.evaluate(() => {
    window.__hands = [];
  });
  const points = await page.evaluate(
    () => JSON.parse(localStorage.getItem('right-typer.v1')!).calibration.points,
  );
  await page.getByRole('button', { name: 'Edit setup' }).click();
  for (const mode of ['standard', 'alternate', 'either'] as FingeringMode[]) {
    await page.getByLabel('Fingering', { exact: true }).selectOption(mode);
    for (const angle of [0, 90, 180, 270]) {
      await page.getByLabel('Rotate camera view').selectOption(String(angle));
      for (const selected of [false, true]) {
        await page
          .getByRole('button', { name: `Map ${selected ? 'w' : 'q'}`, exact: true })
          .click();
        for (const key of ['w', 'y', 'b', 'space-left', 'space-right']) {
          const policyKey = key.startsWith('space') ? ' ' : key;
          const fingers = orderedFingers(allowedFingers(policyKey, mode));
          await expect
            .poll(() =>
              page.locator('#overlay').evaluate(
                (el, args) => {
                  const canvas = el as HTMLCanvasElement;
                  const ctx = canvas.getContext('2d')!;
                  const root = getComputedStyle(document.documentElement);
                  const [x, y] = [args.point.x * canvas.width, args.point.y * canvas.height];
                  const a = (args.angle * Math.PI) / 180;
                  const sample = (offset: number) =>
                    Array.from(
                      ctx.getImageData(
                        Math.floor(x + offset * Math.cos(a)),
                        Math.floor(y - offset * Math.sin(a)),
                        1,
                        1,
                      ).data,
                    );
                  const rgb = (finger: string) => {
                    const hex = root.getPropertyValue(`--${finger}`).trim().slice(1);
                    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255);
                  };
                  return [-2, 2].every(
                    (offset, i) =>
                      JSON.stringify(sample(offset)) ===
                      JSON.stringify(rgb(args.fingers[i === 0 ? 0 : args.fingers.length - 1]!)),
                  );
                },
                { point: points[key], angle, fingers },
              ),
            )
            .toBe(true);
        }
        // Unchanged radius: selected w is 9px; ordinary w is 5px (plus 1px outline).
        await expect
          .poll(async () => {
            const alpha = await page.locator('#overlay').evaluate(
              (el, args) => {
                const canvas = el as HTMLCanvasElement;
                const p = args.point;
                return canvas
                  .getContext('2d')!
                  .getImageData(
                    Math.floor(p.x * canvas.width + 8 * Math.cos((args.angle * Math.PI) / 180)),
                    Math.floor(p.y * canvas.height - 8 * Math.sin((args.angle * Math.PI) / 180)),
                    1,
                    1,
                  ).data[3];
              },
              { point: points.w, angle },
            );
            return (alpha ?? 0) > 0;
          })
          .toBe(selected);
      }
      if (mode === 'either') {
        for (const background of ['#fafafa', '#151515']) {
          await page.locator('video').evaluate((el) => {
            el.style.visibility = 'hidden';
          });
          await page.locator('#camera-image').evaluate((el, colour) => {
            el.style.background = colour;
          }, background);
          await page.locator('#view-wrap').screenshot({
            path: `test-results/dots-${angle}-${background.slice(1)}-synthetic.png`,
          });
        }
      }
    }
  }
});

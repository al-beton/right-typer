import { describe, expect, it } from 'vitest';
import { boundCrop, cropPixels, fullCrop } from '../src/view/crop';
describe('Desk View crop pixel geometry', () => {
  it('preserves the requested off-center source rectangle and aspect ratio', () => {
    expect(cropPixels({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, 1920, 1440)).toEqual({
      x: 480,
      y: 720,
      width: 960,
      height: 360,
      outputWidth: 640,
      outputHeight: 240,
    });
  });
  it('does not upscale or stretch a small crop', () => {
    expect(cropPixels({ x: 0, y: 0, width: 0.2, height: 0.1 }, 1000, 1000)).toMatchObject({
      width: 200,
      height: 100,
      outputWidth: 200,
      outputHeight: 100,
    });
    expect(cropPixels(fullCrop(), 480, 1920)).toMatchObject({
      outputWidth: 160,
      outputHeight: 640,
    });
  });
  it('keeps the minimum-sized crop inside the source at every edge', () => {
    expect(boundCrop({ x: 1, y: -1, width: 0, height: NaN })).toEqual({
      x: 0.95,
      y: 0,
      width: 0.05,
      height: 0.05,
    });
    const result = cropPixels({ x: 1, y: 1, width: 0.051, height: 0.053 }, 1919, 1439);
    expect(result.x + result.width).toBeLessThanOrEqual(1919);
    expect(result.y + result.height).toBeLessThanOrEqual(1439);
  });
});

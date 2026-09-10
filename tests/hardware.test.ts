import { describe, it, expect } from 'vitest';
import { PRESETS, calibrationCodes } from '../src/core/profile';
import { hardwareKeys } from '../src/view/hardware';

describe('hardware illustrations remain independent of camera mappings', () => {
  for (const p of PRESETS)
    it(p.id, () => {
      const before = structuredClone(p);
      const drawn = hardwareKeys(p);
      expect(new Set(drawn.map((k) => k.code)).size).toBe(drawn.length);
      for (const k of p.keys) {
        const visual = drawn.find((d) => d.code === k.code)!;
        expect(visual, k.code).toBeDefined();
        for (const field of ['x', 'y', 'width', 'height'] as const)
          expect(visual[field], `${k.code}.${field}`).toBe(k[field]);
      }
      expect(p).toEqual(before);
      expect(calibrationCodes(p)).toHaveLength(30);
      expect(drawn.find((k) => k.code === 'Backspace')).toBeDefined();
      expect(p.keys.find((k) => k.code === 'Backspace')).toBeUndefined();
    });
  it('uses custom coordinates and outputs without attaching a stock hardware frame', () => {
    const p = structuredClone(PRESETS[0]!);
    p.id = 'custom-test';
    p.keys.find((k) => k.code === 'KeyQ')!.x = -3;
    const drawn = hardwareKeys(p);
    expect(drawn.find((k) => k.code === 'KeyQ')!.x).toBe(-3);
    expect(drawn.find((k) => k.code === 'Backspace')).toBeUndefined();
  });
});

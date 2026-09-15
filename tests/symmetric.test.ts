import { expect, it } from 'vitest';
import { PRESETS, parseProfile, profileFingers, geometrySignature } from '../src/core/profile';
import { symmetricFingers, allowedFingers } from '../src/core/keyboard';
import { signature, emptyData, getCohort } from '../src/curriculum/progress';
const matrix = {
  KeyZ: 'left-ring',
  KeyX: 'left-middle',
  KeyC: 'left-index',
  KeyV: 'left-index',
  KeyE: 'left-middle',
  KeyR: 'left-index',
  KeyM: 'right-index',
  Comma: 'right-middle',
  Period: 'right-ring',
  Digit1: 'left-little',
  Digit2: 'left-ring',
  Digit3: 'left-middle',
  Digit4: 'left-middle',
  Digit5: 'left-index',
  Digit6: 'left-index',
  Digit7: 'right-index',
  Digit8: 'right-middle',
  Digit9: 'right-middle',
  Digit0: 'right-ring',
};
it('resolves physical positions across all presets, with only B changing between variants', () => {
  for (const profile of PRESETS) {
    const before = JSON.stringify(profile);
    for (const mode of ['symmetric-left', 'symmetric-right'] as const) {
      for (const [code, finger] of Object.entries(matrix)) {
        expect(symmetricFingers(code, mode)).toEqual([finger]);
        if (profile.keys.some((k) => k.code === code))
          expect(profileFingers(profile, code, mode)).toEqual([finger]);
      }
      expect(profileFingers(profile, 'Space', mode)).toEqual(['left-thumb', 'right-thumb']);
    }
    expect(
      profile.keys
        .filter(
          (k) =>
            JSON.stringify(profileFingers(profile, k.code, 'symmetric-left')) !==
            JSON.stringify(profileFingers(profile, k.code, 'symmetric-right')),
        )
        .map((k) => k.code),
    ).toEqual(['KeyB']);
    expect(JSON.stringify(profile)).toBe(before);
  }
});
it('roundtrips legacy/custom arrays unchanged; new fixed zones ignore output remapping, extras inherit Standard', () => {
  const p = structuredClone(PRESETS[0]!);
  p.id = 'custom-split';
  const c = p.keys.find((k) => k.code === 'KeyC')!;
  c.standard = ['right-little'];
  c.alternate = ['left-thumb'];
  c.outputs[0]!.text = 'z';
  p.keys.push({ ...structuredClone(c), code: 'Numpad1', outputs: [], standard: ['right-thumb'] });
  const text = JSON.stringify(p);
  const loaded = parseProfile(text);
  expect(JSON.stringify(loaded)).toBe(text);
  expect(profileFingers(loaded, 'KeyC', 'standard')).toEqual(['right-little']);
  expect(profileFingers(loaded, 'KeyC', 'either')).toEqual(['right-little', 'left-thumb']);
  for (const mode of ['symmetric-left', 'symmetric-right'] as const) {
    expect(profileFingers(loaded, 'KeyC', mode)).toEqual(['left-index']);
    expect(profileFingers(loaded, 'Numpad1', mode)).toEqual(['right-thumb']);
  }
  expect(geometrySignature(loaded)).toBe(geometrySignature(p));
  expect(JSON.stringify(loaded)).toBe(text);
  expect(allowedFingers('m', 'either')).toEqual(['right-index', 'right-middle']);
  expect(allowedFingers('e', 'either')).toEqual(['left-middle', 'left-ring']);
});
it('separates new policy cohorts and restores the old cohort without changing it', () => {
  const data = emptyData(),
    p = PRESETS[0]!;
  const original = getCohort(data, signature(p, 'standard'), 1);
  original.total = 7;
  const left = getCohort(data, signature(p, 'symmetric-left'), 1);
  const right = getCohort(data, signature(p, 'symmetric-right'), 1);
  expect(new Set([original.signature, left.signature, right.signature]).size).toBe(3);
  expect(left.total).toBe(0);
  expect(right.total).toBe(0);
  expect(getCohort(data, signature(p, 'standard'), 1)).toBe(original);
  expect(original.total).toBe(7);
});

import { expect, it } from 'vitest';
import {
  PRESETS,
  LEGACY_APPLE_BRITISH,
  geometrySignature,
  calibrationGeometrySignature,
  calibrationCodes,
} from '../src/core/profile';
import { load, save } from '../src/core/storage';
import { calibration, frame } from './fixtures';
import { keyAxes, keyDistance } from '../src/core/calibration';
import { attribute } from '../src/core/observation';

const oldCalibration = () => ({
  ...load({ getItem: () => JSON.stringify({ calibration: calibration() }) }).calibration!,
  profile: structuredClone(LEGACY_APPLE_BRITISH),
});
it('MacBook presets span C–M; PC presets follow the 6.25u reference', () => {
  for (const p of PRESETS) {
    const space = p.keys.find((k) => k.code === 'Space')!;
    if (p.id.startsWith('apple-')) {
      const c = p.keys.find((k) => k.code === 'KeyC')!,
        m = p.keys.find((k) => k.code === 'KeyM')!;
      expect(space.x).toBe(c.x);
      expect(space.x + space.width).toBe(m.x + m.width);
    } else expect([space.x, space.width]).toEqual([2.25, 6.25]);
    expect(space.standard).toEqual(['left-thumb', 'right-thumb']);
    expect(space.alternate).toEqual(space.standard);
  }
});
it('upgrades old British drawing automatically, retains every camera point and archives the original snapshot', () => {
  const old = oldCalibration();
  let raw = JSON.stringify({
    profileId: 'apple-gb-iso',
    calibration: old,
    calibrations: { 'apple-gb-iso': old },
  });
  const storage = {
    getItem: () => raw,
    setItem: (_: string, v: string) => {
      raw = v;
    },
  };
  const s = load(storage);
  expect(s.profileId).toBe('apple-gb-iso');
  expect(s.calibration).toEqual({ ...old, profile: PRESETS[2] });
  expect(s.calibrationHistory!['apple-gb-iso']).toEqual(old);
  save(s, storage);
  expect(load(storage)).toEqual(s);
});
it('upgrades only PR34 generated stock copies and leaves arbitrary custom geometry and finger mappings alone', () => {
  const old = oldCalibration();
  const generated = {
    ...structuredClone(LEGACY_APPLE_BRITISH),
    id: 'saved-apple-gb-iso',
    name: 'MacBook British — saved geometry',
  };
  const custom = { ...structuredClone(generated), id: 'saved-apple-gb-iso-2' };
  custom.keys[0]!.alternate = ['left-middle'];
  const s = load({
    getItem: () =>
      JSON.stringify({
        profileId: generated.id,
        calibration: old,
        calibrations: { [generated.id]: old },
        customProfiles: [generated, custom],
      }),
  });
  expect(s.profileId).toBe('apple-gb-iso');
  expect(s.customProfiles).toEqual([custom]);
  expect(s.calibration!.points).toEqual(old.points);
  expect(s.calibrationHistory![generated.id]).toEqual(old);
  const selectedCustom = load({
    getItem: () =>
      JSON.stringify({
        profileId: custom.id,
        calibration: { ...old, profile: custom },
        customProfiles: [custom],
      }),
  });
  expect(selectedCustom.profileId).toBe(custom.id);
  expect(selectedCustom.calibration!.profile).toEqual(custom);
});
it('preserves a full custom collection while upgrading a built-in', () => {
  const customs = Array.from({ length: 20 }, (_, i) => ({
    ...structuredClone(PRESETS[0]!),
    id: `custom-${i}`,
  }));
  const s = load({
    getItem: () => JSON.stringify({ calibration: calibration(), customProfiles: customs }),
  });
  expect(s.customProfiles).toEqual(customs);
  expect(s.profileId).toBe('apple-gb-iso');
});
it('Space drawing changes and ANSI/ISO metadata cannot change calibrated axes, distances or observations', () => {
  const old = oldCalibration();
  for (const p of [PRESETS[0]!, PRESETS[1]!, PRESETS[2]!, PRESETS[5]!]) {
    const next = { ...old, profile: p };
    expect(calibrationGeometrySignature(p)).toBe(calibrationGeometrySignature(old.profile));
    for (const code of calibrationCodes(p).filter((k) => !k.startsWith('space-')))
      expect(keyAxes(next, code)).toEqual(keyAxes(old, code));
    for (const code of [...calibrationCodes(p).filter((k) => !k.startsWith('space-')), 'Space'])
      for (let x = 0; x <= 10; x++)
        for (let y = 0; y <= 10; y++)
          expect(keyDistance(next, code, { x: x / 10, y: y / 10 })).toBe(
            keyDistance(old, code, { x: x / 10, y: y / 10 }),
          );
    for (const [key, code] of [
      ['q', 'KeyQ'],
      [' ', 'Space'],
    ] as const)
      for (const finger of ['left-little', 'left-index', 'right-thumb'] as const)
        expect(attribute({ key, code, at: 100 }, [frame(1, 100, key, finger)], next)).toEqual(
          attribute({ key, code, at: 100 }, [frame(1, 100, key, finger)], old),
        );
  }
  const split = structuredClone(PRESETS[2]!);
  split.keys.find((k) => k.code === 'KeyQ')!.x += 2;
  expect(calibrationGeometrySignature(split)).not.toBe(calibrationGeometrySignature(old.profile));
  expect(geometrySignature(PRESETS[2]!)).not.toBe(geometrySignature(old.profile));
});

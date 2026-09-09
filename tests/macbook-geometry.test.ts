import { expect, it } from 'vitest';
import { PRESETS, LEGACY_APPLE_BRITISH, geometrySignature } from '../src/core/profile';
import { load, save } from '../src/core/storage';
import { calibration } from './fixtures';

it('MacBook presets span C–M; PC preset dimensions stay unchanged', () => {
  for (const p of PRESETS) {
    const space = p.keys.find((k) => k.code === 'Space')!;
    if (p.id.startsWith('apple-')) {
      const c = p.keys.find((k) => k.code === 'KeyC')!;
      const m = p.keys.find((k) => k.code === 'KeyM')!;
      expect(space.x).toBe(c.x);
      expect(space.x + space.width).toBe(m.x + m.width);
    } else expect([space.x, space.width]).toEqual([2, 6]);
    expect(space.standard).toEqual(['left-thumb', 'right-thumb']);
    expect(space.alternate).toEqual(space.standard);
  }
});

it('retains old snapshots, custom geometry and edited saved maps across reloads', () => {
  const migrated = load({ getItem: () => JSON.stringify({ calibration: calibration() }) });
  const old = migrated.calibration!;
  expect(old.profile).toEqual(LEGACY_APPLE_BRITISH);
  const custom = structuredClone(PRESETS[0]!);
  custom.id = 'my-split';
  custom.keys.find((k) => k.code === 'Space')!.width = 3.25;
  let raw = JSON.stringify({
    profileId: 'apple-gb-iso',
    calibration: old,
    calibrations: { 'apple-gb-iso': old },
    customProfiles: [custom],
  });
  const storage = {
    getItem: () => raw,
    setItem: (_: string, v: string) => {
      raw = v;
    },
  };
  const saved = load(storage);
  expect(saved.calibration).toEqual(old);
  expect(saved.customProfiles![0]).toEqual(custom);
  const retained = saved.customProfiles!.find((p) => p.id === saved.profileId)!;
  expect(geometrySignature(retained)).toBe(geometrySignature(old.profile!));
  expect(geometrySignature(retained)).not.toBe(geometrySignature(PRESETS[2]!));
  saved.calibrations![retained.id]!.savedAt = 999;
  save(saved, storage);
  expect(load(storage).calibrations![retained.id]!.savedAt).toBe(999);
  expect(load(storage).customProfiles).toEqual(saved.customProfiles);
});

it('retains a full custom collection and does not reselect the old setup after choosing the corrected preset', () => {
  const customProfiles = Array.from({ length: 20 }, (_, i) => ({
    ...structuredClone(PRESETS[0]!),
    id: `custom-${i}`,
    name: `Custom ${i}`,
  }));
  let raw = JSON.stringify({ calibration: calibration(), customProfiles });
  const storage = {
    getItem: () => raw,
    setItem: (_: string, v: string) => {
      raw = v;
    },
  };
  const s = load(storage);
  expect(s.customProfiles).toHaveLength(21);
  save(s, storage);
  expect(load(storage).customProfiles).toEqual(s.customProfiles);
  s.profileId = 'apple-gb-iso';
  s.calibration = undefined;
  save(s, storage);
  expect(load(storage).profileId).toBe('apple-gb-iso');
  expect(load(storage).calibration).toBeUndefined();
  expect(load(storage).customProfiles).toEqual(s.customProfiles);
});

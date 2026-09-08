import { expect, it } from 'vitest';
import { load, save } from '../src/core/storage';

it('persists quarter turns and ignores malformed saved camera angles', () => {
  let raw = '{}';
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
  for (const cameraRotation of [0, 90, 180, 270] as const) {
    expect(save({ cameraRotation, results: [] }, storage)).toBe(true);
    expect(load(storage).cameraRotation).toBe(cameraRotation);
  }
  for (const bad of [-90, 360, '90', null, {}, 45]) {
    raw = JSON.stringify({ cameraRotation: bad, results: [] });
    expect(load(storage).cameraRotation).toBeUndefined();
  }
});

it('persists explicit camera and Go preferences without treating malformed values as enabled', () => {
  let raw = '{}';
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
  for (const practiceEnabled of [true, false]) {
    expect(save({ cameraDeviceId: 'external-camera', practiceEnabled, results: [] }, storage)).toBe(
      true,
    );
    expect(load(storage)).toMatchObject({ cameraDeviceId: 'external-camera', practiceEnabled });
  }
  raw = JSON.stringify({ cameraDeviceId: {}, practiceEnabled: 'true' });
  expect(load(storage).cameraDeviceId).toBeUndefined();
  expect(load(storage).practiceEnabled).toBeUndefined();
});

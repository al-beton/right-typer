import { expect, it } from 'vitest';
import { sourceFrameTime } from '../src/tracking/timing';
import { EvidenceBuffer, attribute } from '../src/core/observation';
import { calibration, frame } from './fixtures';
import { cameraMapKey, load, save } from '../src/core/storage';

const metadata = (captureTime?: number) =>
  ({ captureTime, mediaTime: 5, presentedFrames: 8 }) as VideoFrameCallbackMetadata;
it('preserves ordinary webcam clock policy and distinguishes Desk View and screen estimates', () => {
  expect(sourceFrameTime(metadata(500), 600, 'camera')).toMatchObject({
    at: 500,
    clock: 'capture',
  });
  expect(sourceFrameTime(metadata(), 600, 'camera')).toMatchObject({
    at: 600,
    clock: 'unavailable',
  });
  for (const source of ['desk-view', 'window'] as const) {
    expect(sourceFrameTime(metadata(500), 600, source)).toMatchObject({
      at: 500,
      clock: 'estimated',
      timing: { source, nativeCaptureTime: 500, callbackAt: 600, uncertaintyMs: null },
    });
    expect(sourceFrameTime(metadata(), 600, source)).toMatchObject({
      at: 600,
      clock: 'estimated',
      timing: { basis: 'callback', nativeCaptureTime: null },
    });
  }
});
it('attributes independently observed fingers from estimated frames and retains provenance', () => {
  const timed = {
    ...frame(1, 500, 'a', 'right-index'),
    ...sourceFrameTime(metadata(500), 600, 'window'),
  };
  const observation = attribute({ key: 'a', at: 510 }, [timed], calibration());
  expect(observation).toMatchObject({
    kind: 'finger',
    finger: 'right-index',
    frameIds: [1],
    offsetMs: -10,
    timing: timed.timing,
  });
  expect(attribute({ key: 'a', at: 510 }, [{ ...timed, hands: [] }], calibration())).toMatchObject({
    kind: 'uncertain',
  });
});
it('uses the same estimated timeline for nearest candidates, watermark and in-flight settlement', async () => {
  const buffer = new EvidenceBuffer();
  buffer.add({
    ...frame(1, 470, 'a', 'left-little'),
    ...sourceFrameTime(metadata(470), 600, 'window'),
  });
  buffer.startFrame(2, 505);
  buffer.add({
    ...frame(3, 550, 'a', 'left-middle'),
    ...sourceFrameTime(metadata(550), 650, 'window'),
  });
  let settled = false;
  const result = buffer
    .request({ id: 1, attemptId: 1, key: 'a', at: 500 }, calibration())
    .then((o) => {
      settled = true;
      return o;
    });
  buffer.tick(650);
  await Promise.resolve();
  expect(settled).toBe(false);
  buffer.add({
    ...frame(2, 505, 'a', 'right-index'),
    ...sourceFrameTime(metadata(505), 610, 'window'),
  });
  buffer.tick(700);
  expect(await result).toMatchObject({
    kind: 'finger',
    finger: 'right-index',
    frameIds: [2],
    offsetMs: 5,
  });
});
it('retains independent camera maps through storage round trips and rejects mismatched identities', () => {
  const webcam = load({
    getItem: () => JSON.stringify({ calibration: calibration() }),
  }).calibration!;
  const desk = { ...webcam, deviceId: 'desk-view', width: 1920, height: 1440 };
  let data = JSON.stringify({
    profileId: webcam.profile!.id,
    calibration: webcam,
    calibrations: { [webcam.profile!.id]: webcam },
    cameraCalibrations: { [cameraMapKey(desk.deviceId, desk.profile!.id)]: desk, bad: desk },
  });
  const storage = {
    getItem: () => data,
    setItem: (_: string, v: string) => {
      data = v;
    },
  };
  const saved = load(storage);
  expect(Object.keys(saved.cameraCalibrations!)).toHaveLength(2);
  save(saved, storage);
  expect(load(storage)).toEqual(saved);
});

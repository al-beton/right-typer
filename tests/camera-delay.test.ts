import { expect, it } from 'vitest';
import { cameraDelayKey, isCameraDelay } from '../src/core/camera-delay';
import { sourceFrameTime } from '../src/tracking/timing';
import { EvidenceBuffer } from '../src/core/observation';
import { load, save } from '../src/core/storage';
import { calibration, frame } from './fixtures';
import type { Finger } from '../src/core/types';

const timed = (id: number, raw: number, receivedAt: number, delay: number, finger: Finger) => ({
  ...frame(id, raw, 'r', finger, receivedAt),
  ...sourceFrameTime(
    { captureTime: raw, mediaTime: raw / 1000, presentedFrames: id } as VideoFrameCallbackMetadata,
    raw + 15,
    'desk-view',
    delay,
  ),
});
it.each([0, 50])(
  'D=%s shifts evidence earlier and waits for the later matching image',
  async (delay) => {
    const buffer = new EvidenceBuffer();
    buffer.add(timed(10, 1000, 1015, delay, 'left-middle'));
    let settled = false;
    const result = buffer
      .request({ id: 1, attemptId: 1, key: 'r', at: 1000 }, calibration())
      .then((o) => {
        settled = true;
        return o;
      });
    buffer.tick(1015);
    await Promise.resolve();
    expect(settled).toBe(false);
    buffer.startFrame(11, 1050 - delay);
    buffer.add(timed(12, 1060, 1090, delay, 'left-ring'));
    buffer.tick(1090);
    await Promise.resolve();
    expect(settled).toBe(delay === 0);
    buffer.add(timed(11, 1050, 1080, delay, 'left-index'));
    buffer.tick(1095);
    expect(await result).toMatchObject({
      kind: 'finger',
      finger: delay === 0 ? 'left-middle' : 'left-index',
      frameIds: [delay === 0 ? 10 : 11],
      offsetMs: 0,
    });
  },
);
it('uses capture timing once and records only explicit extra delay, not callback or inference latency', () => {
  const metadata = {
    captureTime: 1000,
    mediaTime: 1,
    presentedFrames: 10,
  } as VideoFrameCallbackMetadata;
  expect(sourceFrameTime(metadata, 1050, 'camera')).toMatchObject({
    at: 1000,
    clock: 'capture',
    timing: { nativeCaptureTime: 1000, callbackAt: 1050, offsetMs: 0 },
  });
  expect(sourceFrameTime(metadata, 1050, 'desk-view', 50)).toMatchObject({
    at: 950,
    clock: 'estimated',
    timing: {
      basis: 'browser-capture',
      nativeCaptureTime: 1000,
      callbackAt: 1050,
      offsetMs: -50,
      residualDelayMs: 50,
      uncertaintyMs: null,
    },
  });
  expect(
    sourceFrameTime({ ...metadata, captureTime: undefined }, 1050, 'window', 50),
  ).toMatchObject({ at: 1000, timing: { basis: 'callback', offsetMs: -50, residualDelayMs: 50 } });
});
it('keeps dropped/inflight frames bounded and rejects evidence outside the search window', async () => {
  const buffer = new EvidenceBuffer();
  buffer.add(timed(1, 400, 500, 50, 'left-index'));
  buffer.startFrame(2, 1000);
  const result = buffer.request({ id: 1, attemptId: 1, key: 'r', at: 1000 }, calibration());
  buffer.tick(2000);
  expect((await result).kind).toBe('uncertain');
  buffer.add(timed(2, 1050, 2100, 50, 'left-index'));
  const next = buffer.request({ id: 2, attemptId: 2, key: 'r', at: 1050 }, calibration());
  buffer.reset();
  expect((await next).kind).toBe('uncertain');
  expect(buffer.frames).toEqual([]);
});
it('selects jittered compensated frames by physical estimate, not arrival order', async () => {
  const buffer = new EvidenceBuffer();
  buffer.add(timed(2, 1068, 1110, 50, 'left-middle'));
  buffer.add(timed(1, 1047, 1120, 50, 'left-index'));
  const result = buffer.request({ id: 1, attemptId: 1, key: 'r', at: 1000 }, calibration());
  buffer.tick(1125);
  expect(await result).toMatchObject({ finger: 'left-index', offsetMs: -3 });
});
it('bounds values and persists identified source settings without assigning all windows one identity', () => {
  const a = cameraDelayKey('desk-view', 'camera-a', 960, 720, 'browser-capture')!;
  const b = cameraDelayKey('camera', 'camera-a', 960, 720, 'browser-capture')!;
  expect(a).not.toBe(b);
  expect(cameraDelayKey('window', 'same-label', 960, 720, 'browser-capture')).toBeNull();
  expect(cameraDelayKey('camera', '', 960, 720, 'browser-capture')).toBeNull();
  expect([0, 50, 500].every(isCameraDelay)).toBe(true);
  expect([-1, 501, 0.5, NaN, Infinity, '50'].some(isCameraDelay)).toBe(false);
  let raw = JSON.stringify({
    cameraDelays: { [a]: 50, [b]: 0, invalid: 501 },
    lastWindowDelayMs: 75,
  });
  const storage = {
    getItem: () => raw,
    setItem: (_: string, value: string) => {
      raw = value;
    },
  };
  const saved = load(storage);
  expect(saved.cameraDelays).toEqual({ [a]: 50, [b]: 0 });
  expect(save(saved, storage)).toBe(true);
  expect(load(storage).lastWindowDelayMs).toBe(75);
  expect(
    load(storage).cameraDelays?.[
      cameraDelayKey('desk-view', 'camera-b', 960, 720, 'browser-capture')!
    ],
  ).toBeUndefined();
});

it.each([0, 50, 500])('fixes deadline at press + D + processing budget for D=%s', async (delay) => {
  const buffer = new EvidenceBuffer();
  let settled = false;
  const result = buffer
    .request({ id: 1, attemptId: 1, key: 'r', at: 1000 }, calibration(), delay)
    .then((o) => {
      settled = true;
      return o;
    });
  buffer.startFrame(10, 1000);
  buffer.tick(1999 + delay);
  await Promise.resolve();
  expect(settled).toBe(false);
  buffer.tick(2000 + delay);
  expect((await result).kind).toBe('uncertain');
  buffer.add(timed(10, 1000 + delay, 2100 + delay, delay, 'left-index'));
  buffer.tick(2200 + delay);
  expect(settled).toBe(true);
});
it('never applies a manual residual to ordinary camera timestamps', () => {
  const metadata = {
    captureTime: 1000,
    mediaTime: 1,
    presentedFrames: 1,
  } as VideoFrameCallbackMetadata;
  expect(sourceFrameTime(metadata, 1050, 'camera', 50)).toMatchObject({
    at: 1000,
    clock: 'capture',
    timing: { residualDelayMs: 0 },
  });
  expect(
    sourceFrameTime({ ...metadata, captureTime: undefined }, 1050, 'camera', 50),
  ).toMatchObject({ at: 1050, clock: 'unavailable' });
  expect(cameraDelayKey('desk-view', 'a', 960, 720, 'callback')).not.toBe(
    cameraDelayKey('desk-view', 'a', 960, 720, 'browser-capture'),
  );
});

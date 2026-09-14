import { afterEach, expect, it, vi } from 'vitest';
import { Camera } from '../src/tracking/camera';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture() {
  vi.useFakeTimers();
  const track = { stop: vi.fn(), onended: null, getSettings: () => ({}) };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  const media = deferred<MediaStream>();
  const play = deferred<void>();
  const video = {
    srcObject: null,
    play: () => play.promise,
    pause: vi.fn(),
    requestVideoFrameCallback: vi.fn(() => 42),
    cancelVideoFrameCallback: vi.fn(),
  } as unknown as HTMLVideoElement;
  class WorkerMock {
    static instances: WorkerMock[] = [];
    onmessage?: (e: { data: unknown }) => void;
    onerror?: () => void;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() {
      WorkerMock.instances.push(this);
    }
  }
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => media.promise } });
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('document', { baseURI: 'http://localhost/', hidden: false });
  vi.stubGlobal('Worker', WorkerMock);
  vi.stubGlobal(
    'VideoFrame',
    class {
      close() {}
    },
  );
  vi.stubGlobal('createImageBitmap', vi.fn());
  const frame = vi.fn();
  const camera = new Camera(video, vi.fn(), frame);
  return { camera, media, play, stream, track, video, WorkerMock, frame };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('stops a stream returned after permission was cancelled without starting playback', async () => {
  const f = fixture();
  const start = f.camera.start();
  f.camera.stop();
  f.media.resolve(f.stream);
  await start;
  expect(f.track.stop).toHaveBeenCalledOnce();
  expect(f.video.srcObject).toBeNull();
  expect(f.WorkerMock.instances).toHaveLength(0);
  expect(f.camera.status).toBe('off');
});
it('stops during playback startup and ignores its late completion', async () => {
  const f = fixture();
  const start = f.camera.start();
  f.media.resolve(f.stream);
  await Promise.resolve();
  f.camera.stop();
  f.play.resolve();
  await start;
  expect(f.track.stop).toHaveBeenCalledOnce();
  expect(f.WorkerMock.instances).toHaveLength(0);
  expect(f.video.srcObject).toBeNull();
});
it('terminates loading/running workers, timers and callbacks and rejects late worker events', async () => {
  const f = fixture();
  const start = f.camera.start();
  f.media.resolve(f.stream);
  f.play.resolve();
  await start;
  const worker = f.WorkerMock.instances[0]!;
  const oldError = worker.onerror!;
  worker.onmessage!({ data: { type: 'ready' } });
  expect(f.video.requestVideoFrameCallback).toHaveBeenCalledOnce();
  f.camera.stop();
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(f.track.stop).toHaveBeenCalledOnce();
  expect(f.video.cancelVideoFrameCallback).toHaveBeenLastCalledWith(42);
  expect(vi.getTimerCount()).toBe(0);
  worker.onmessage!({ data: { type: 'ready' } });
  worker.onmessage!({ data: { type: 'frame', id: 1, at: 1, hands: [] } });
  oldError();
  expect(f.camera.status).toBe('off');
  expect(f.camera.latest).toBeUndefined();
  expect(f.frame).not.toHaveBeenCalled();
  await f.camera.start();
  oldError();
  expect(f.camera.status).toBe('loading');
  f.camera.stop();
});

it('closes a bitmap completed after disconnect without submitting it to either worker', async () => {
  const f = fixture();
  let capture!: (now: number, metadata: VideoFrameCallbackMetadata) => void;
  vi.mocked(f.video.requestVideoFrameCallback).mockImplementation((cb) => {
    capture = cb;
    return 42;
  });
  const frozenClose = vi.fn();
  vi.stubGlobal(
    'VideoFrame',
    class {
      close = frozenClose;
    },
  );
  const bitmap = deferred<ImageBitmap>();
  vi.stubGlobal('createImageBitmap', () => bitmap.promise);
  const start = f.camera.start();
  f.media.resolve(f.stream);
  f.play.resolve();
  await start;
  const worker = f.WorkerMock.instances[0]!;
  worker.onmessage!({ data: { type: 'ready' } });
  capture(performance.now(), {} as VideoFrameCallbackMetadata);
  f.camera.stop();
  await f.camera.start();
  const close = vi.fn();
  bitmap.resolve({ close } as unknown as ImageBitmap);
  await bitmap.promise;
  await Promise.resolve();
  await Promise.resolve();
  expect(close).toHaveBeenCalledOnce();
  expect(frozenClose).toHaveBeenCalledOnce();
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  expect(f.WorkerMock.instances[1]!.postMessage).toHaveBeenCalledTimes(1);
  f.camera.stop();
});

it('crops the model bitmap and transforms landmarks back into source coordinates', async () => {
  const f = fixture();
  Object.assign(f.video, { videoWidth: 960, videoHeight: 720 });
  let capture!: VideoFrameRequestCallback;
  vi.mocked(f.video.requestVideoFrameCallback).mockImplementation((cb) => {
    capture = cb;
    return 42;
  });
  const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
  const create = vi.fn(async () => bitmap);
  vi.stubGlobal('createImageBitmap', create);
  const drawImage = vi.fn();
  const cropped = { close: vi.fn() } as unknown as ImageBitmap;
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext = () => ({ drawImage });
      transferToImageBitmap = () => cropped;
    },
  );
  const start = f.camera.start();
  f.media.resolve(f.stream);
  f.play.resolve();
  await start;
  const worker = f.WorkerMock.instances[0]!;
  worker.onmessage!({ data: { type: 'ready' } });
  f.camera.setCrop({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  capture(performance.now(), {} as VideoFrameCallbackMetadata);
  await Promise.resolve();
  expect(drawImage).toHaveBeenCalledWith(bitmap, 240, 180, 480, 360, 0, 0, 480, 360);
  expect(bitmap.close).toHaveBeenCalledOnce();
  const sent = worker.postMessage.mock.calls.at(-1)![0];
  expect(sent.bitmap).toBe(cropped);
  worker.onmessage!({
    data: {
      type: 'frame',
      id: sent.id,
      at: sent.at,
      clock: sent.clock,
      hands: [{ side: 'left', score: 0.9, points: [{ x: 0.2, y: 0.4, z: 0.2 }] }],
    },
  });
  expect(f.camera.latest?.hands[0]?.points[0]).toEqual({ x: 0.35, y: 0.45, z: 0.1 });
  expect(f.frame).toHaveBeenCalledOnce();
  f.camera.stop();
});

it('rejects an old inference result after a crop change clears evidence', async () => {
  const f = fixture();
  Object.assign(f.video, { videoWidth: 960, videoHeight: 720 });
  let capture!: VideoFrameRequestCallback;
  vi.mocked(f.video.requestVideoFrameCallback).mockImplementation((cb) => {
    capture = cb;
    return 42;
  });
  vi.stubGlobal('createImageBitmap', async () => ({ close: vi.fn() }));
  const start = f.camera.start();
  f.media.resolve(f.stream);
  f.play.resolve();
  await start;
  const worker = f.WorkerMock.instances[0]!;
  worker.onmessage!({ data: { type: 'ready' } });
  capture(performance.now(), {} as VideoFrameCallbackMetadata);
  await Promise.resolve();
  const sent = worker.postMessage.mock.calls.at(-1)![0];
  f.camera.setCrop({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
  worker.onmessage!({ data: { type: 'frame', id: sent.id, at: sent.at, hands: [] } });
  expect(f.frame).not.toHaveBeenCalled();
  expect(f.camera.latest).toBeUndefined();
  f.camera.stop();
});

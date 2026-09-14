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

it('requests a window without audio and releases a share that resolves after stop', async () => {
  const f = fixture();
  const getDisplayMedia = vi.fn(() => f.media.promise);
  Object.assign(navigator.mediaDevices, { getDisplayMedia });
  const start = f.camera.start('', 'window');
  expect(getDisplayMedia).toHaveBeenCalledWith(
    expect.objectContaining({
      audio: false,
      video: { displaySurface: 'window', frameRate: { ideal: 30 } },
      monitorTypeSurfaces: 'exclude',
      selfBrowserSurface: 'exclude',
    }),
  );
  f.camera.stop();
  f.media.resolve(f.stream);
  await start;
  expect(f.track.stop).toHaveBeenCalledOnce();
  expect(f.WorkerMock.instances).toHaveLength(0);
});

it('reports cancellation recoverably without opening a webcam', async () => {
  const f = fixture();
  Object.assign(navigator.mediaDevices, {
    getDisplayMedia: vi.fn().mockRejectedValue(new DOMException('cancelled', 'NotAllowedError')),
  });
  await f.camera.start('', 'window');
  expect(f.camera.status).toBe('error');
  expect(f.camera.error).toContain('cancelled or denied');
  expect(f.video.srcObject).toBeNull();
});

it('never promotes a screen timestamp to original camera exposure evidence', async () => {
  const f = fixture();
  Object.assign(navigator.mediaDevices, { getDisplayMedia: () => f.media.promise });
  vi.spyOn(f.camera.diagnostics, 'sample').mockImplementation(() => {});
  let capture!: (now: number, metadata: VideoFrameCallbackMetadata) => void;
  vi.mocked(f.video.requestVideoFrameCallback).mockImplementation((cb) => {
    capture = cb;
    return 1;
  });
  vi.stubGlobal(
    'VideoFrame',
    class {
      close() {}
    },
  );
  vi.stubGlobal('createImageBitmap', async () => ({ close() {} }));
  const start = f.camera.start('', 'window');
  vi.spyOn(f.camera.diagnostics, 'sample').mockImplementation(() => {});
  f.media.resolve(f.stream);
  f.play.resolve();
  await start;
  const worker = f.WorkerMock.instances[0]!;
  worker.onmessage!({ data: { type: 'ready' } });
  vi.advanceTimersByTime(100);
  const now = performance.now();
  capture(now, {
    captureTime: now - 10,
    mediaTime: 1,
    presentedFrames: 1,
  } as VideoFrameCallbackMetadata);
  await Promise.resolve();
  expect(f.camera.diagnostics.nativeCaptureTime).toBe(now - 10);
  expect(worker.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ clock: 'unavailable' }),
    expect.any(Array),
  );
  f.camera.stop();
});

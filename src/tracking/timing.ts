import type { Frame, FrameTiming } from '../core/types';
// Both values are DOMHighResTimeStamp on the Window performance timeline.
// Presentation time is not a substitute for capture time: it hides camera delay.
export function frameTime(
  metadata: Pick<VideoFrameCallbackMetadata, 'captureTime'>,
  now: number,
): number | null {
  const value = metadata.captureTime;
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= now + 5 &&
    now - value <= 2000
    ? value
    : null;
}
export function keyTime(
  event: Pick<KeyboardEvent, 'timeStamp'>,
  now: number,
  timeOrigin: number,
): number {
  const value = event.timeStamp > 1e12 ? event.timeStamp - timeOrigin : event.timeStamp;
  return Number.isFinite(value) && value >= 0 && value <= now + 5 ? value : now;
}

// Source pipeline time is an explicit initial estimate, not sensor exposure.
// Keep the ordinary camera policy unchanged. Desk View adds an upstream camera
// pipeline even when the browser provides captureTime for its output surface.
export function sourceFrameTime(
  metadata: VideoFrameCallbackMetadata,
  now: number,
  source: FrameTiming['source'],
): Pick<Frame, 'at' | 'clock' | 'timing'> {
  const nativeCaptureTime = frameTime(metadata, now);
  return {
    at: nativeCaptureTime ?? now,
    clock:
      source === 'camera' ? (nativeCaptureTime === null ? 'unavailable' : 'capture') : 'estimated',
    timing: {
      source,
      basis: nativeCaptureTime === null ? 'callback' : 'browser-capture',
      nativeCaptureTime:
        typeof metadata.captureTime === 'number' && Number.isFinite(metadata.captureTime)
          ? metadata.captureTime
          : null,
      callbackAt: now,
      mediaTime: metadata.mediaTime,
      presentedFrames: metadata.presentedFrames,
      offsetMs: 0,
      uncertaintyMs: null,
    },
  };
}

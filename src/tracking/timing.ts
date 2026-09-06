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

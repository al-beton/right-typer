import type { FrameTiming } from './types';

export const MAX_CAMERA_DELAY_MS = 500;
export function isCameraDelay(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_CAMERA_DELAY_MS
  );
}
// Device IDs are browser/site scoped. An unidentified window is never a stable device.
export function cameraDelayKey(
  source: FrameTiming['source'],
  deviceId: string,
  width: number,
  height: number,
  basis?: FrameTiming['basis'],
): string | null {
  return source !== 'window' && deviceId && basis
    ? JSON.stringify([source, deviceId, width, height, basis])
    : null;
}

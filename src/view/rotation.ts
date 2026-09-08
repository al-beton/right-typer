import type { Point } from '../core/types';

export type CameraRotation = 0 | 90 | 180 | 270;
export function isCameraRotation(value: unknown): value is CameraRotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}
// The view turns clockwise; calibration stays in native, unrotated camera coordinates.
export function unrotatePoint(point: Point, rotation: CameraRotation): Point {
  switch (rotation) {
    case 90:
      return { x: point.y, y: 1 - point.x };
    case 180:
      return { x: 1 - point.x, y: 1 - point.y };
    case 270:
      return { x: 1 - point.y, y: point.x };
    default:
      return { x: point.x, y: point.y };
  }
}

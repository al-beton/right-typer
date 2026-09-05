import { CALIBRATION_KEYS } from './keyboard';
import type { Calibration, Point } from './types';
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function validCalibration(value: unknown): value is Calibration {
  if (!value || typeof value !== 'object') return false;
  const c = value as Calibration;
  if (
    c.version !== 1 ||
    typeof c.deviceId !== 'string' ||
    typeof c.swapHands !== 'boolean' ||
    !Number.isFinite(c.savedAt) ||
    !(c.width > 0 && c.height > 0) ||
    !c.points
  )
    return false;
  return (
    CALIBRATION_KEYS.every((key) => {
      const p = c.points[key];
      return (
        p &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        p.x >= 0 &&
        p.x <= 1 &&
        p.y >= 0 &&
        p.y <= 1
      );
    }) &&
    CALIBRATION_KEYS.every((key, i) =>
      CALIBRATION_KEYS.slice(i + 1).every(
        (other) => distance(c.points[key]!, c.points[other]!) > 0.006,
      ),
    ) &&
    [...'qwertyuiopasdfghjklzxcvbnm,.'].every((key) => keyAxes(c, key) !== null)
  );
}
// Local axes cope with a rotated or perspective-skewed keyboard without assuming a grid.
export function keyAxes(c: Calibration, key: string): { center: Point; u: Point; v: Point } | null {
  const row = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm,.'].find((r) => r.includes(key));
  if (!row || !c.points[key]) return null;
  const i = row.indexOf(key);
  const neighbor = c.points[row[i === row.length - 1 ? i - 1 : i + 1]!];
  if (!neighbor) return null;
  const center = c.points[key]!;
  const dir = i === row.length - 1 ? -1 : 1;
  const u = { x: (neighbor.x - center.x) * dir, y: (neighbor.y - center.y) * dir };
  const otherRows = [...'qwertyuiopasdfghjklzxcvbnm,.'].filter((k) => !row.includes(k));
  const closest = otherRows
    .map((k) => c.points[k]!)
    .filter(Boolean)
    .sort((a, b) => distance(a, center) - distance(b, center))[0];
  if (!closest) return null;
  const len = Math.hypot(u.x, u.y);
  const dx = closest.x - center.x,
    dy = closest.y - center.y;
  const height = Math.abs((dx * -u.y + dy * u.x) / len);
  if (len < 0.006 || height < 0.006) return null;
  return { center, u, v: { x: (-u.y / len) * height, y: (u.x / len) * height } };
}
export function keyDistance(c: Calibration, key: string, point: Point): number {
  if (key === ' ') {
    const a = c.points['space-left']!,
      b = c.points['space-right']!;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      square = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / square));
    const axes = keyAxes(c, 'b');
    if (!axes) return Infinity;
    const h = Math.hypot(axes.v.x, axes.v.y);
    return distance(point, { x: a.x + t * dx, y: a.y + t * dy }) / h;
  }
  const axes = keyAxes(c, key);
  if (!axes) return Infinity;
  const { center, u, v } = axes;
  const dx = point.x - center.x,
    dy = point.y - center.y;
  const x = (dx * u.x + dy * u.y) / (u.x * u.x + u.y * u.y);
  const y = (dx * v.x + dy * v.y) / (v.x * v.x + v.y * v.y);
  return Math.hypot(x, y);
}

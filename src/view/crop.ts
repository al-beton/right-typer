export type Crop = { x: number; y: number; width: number; height: number };
export const fullCrop = (): Crop => ({ x: 0, y: 0, width: 1, height: 1 });
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
export function boundCrop(crop: Crop): Crop {
  const width = clamp(crop.width, 0.05, 1);
  const height = clamp(crop.height, 0.05, 1);
  return { x: clamp(crop.x, 0, 1 - width), y: clamp(crop.y, 0, 1 - height), width, height };
}
export function cropPixels(crop: Crop, width: number, height: number) {
  const safe = boundCrop(crop);
  const x = Math.floor(safe.x * width);
  const y = Math.floor(safe.y * height);
  const w = Math.max(1, Math.min(width - x, Math.round(safe.width * width)));
  const h = Math.max(1, Math.min(height - y, Math.round(safe.height * height)));
  const scale = Math.min(1, 640 / Math.max(w, h));
  return {
    x,
    y,
    width: w,
    height: h,
    outputWidth: Math.max(1, Math.round(w * scale)),
    outputHeight: Math.max(1, Math.round(h * scale)),
  };
}

export function isCrop(value: unknown): value is Crop {
  if (!value || typeof value !== 'object') return false;
  const c = value as Crop;
  return (
    [c.x, c.y, c.width, c.height].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    c.x >= 0 &&
    c.y >= 0 &&
    c.width >= 0.05 &&
    c.height >= 0.05 &&
    c.x + c.width <= 1.000001 &&
    c.y + c.height <= 1.000001
  );
}
export function hasCrop(crop: Crop) {
  return crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1;
}
export function insideCrop(p: { x: number; y: number }, crop: Crop) {
  return (
    p.x >= crop.x && p.y >= crop.y && p.x <= crop.x + crop.width && p.y <= crop.y + crop.height
  );
}
export function sourcePoint<T extends { x: number; y: number; z?: number }>(p: T, crop: Crop): T {
  return {
    ...p,
    x: crop.x + p.x * crop.width,
    y: crop.y + p.y * crop.height,
    ...(p.z === undefined ? {} : { z: p.z * crop.width }),
  };
}
export function cropSourceKey(deviceId: string, width: number, height: number) {
  return JSON.stringify([deviceId, width, height]);
}

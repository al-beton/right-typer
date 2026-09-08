import type { Finger } from '../core/types';
import { orderedFingers, type FingerPalette } from './finger-colours';

// The caller supplies resolved policy fingers. This renderer knows no key map.
export function drawCalibrationDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fingers: readonly Finger[],
  palette: FingerPalette,
  selected: boolean,
  rotation: number,
) {
  const radius = selected ? 9 : 5;
  const colours = orderedFingers(fingers).map((finger) => palette[finger]);
  ctx.save();
  ctx.translate(x, y);
  // Keep the left/right halves aligned with the upright keyboard and labels.
  ctx.rotate((-rotation * Math.PI) / 180);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();
  colours.forEach((colour, i) => {
    ctx.fillStyle = colour;
    ctx.fillRect(
      -radius + (i * radius * 2) / colours.length,
      -radius,
      (radius * 2) / colours.length,
      radius * 2,
    );
  });
  ctx.restore();
  ctx.strokeStyle = '#183a30';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (selected) {
    // Contrasting inner ring preserves the existing outer radius and finger fill.
    ctx.beginPath();
    ctx.arc(0, 0, radius - 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

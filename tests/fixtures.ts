import type { Calibration, Finger, Frame, SeenHand } from '../src/core/types';
import { DIGITS, LANDMARK_TIPS, ROWS } from '../src/core/keyboard';
export function calibration(): Calibration {
  const points: Calibration['points'] = {};
  ROWS.forEach((row, r) =>
    [...row].forEach((k, i) => {
      points[k] = { x: 0.12 + i * 0.075 + r * 0.022, y: 0.32 + r * 0.16 };
    }),
  );
  points['space-left'] = { x: 0.3, y: 0.84 };
  points['space-right'] = { x: 0.7, y: 0.84 };
  return {
    version: 1,
    deviceId: 'test-camera',
    width: 960,
    height: 720,
    points,
    swapHands: false,
    savedAt: 1,
  };
}
export function handsAt(key: string, finger: Finger, c = calibration()): SeenHand[] {
  const hands: SeenHand[] = ['left', 'right'].map((side) => ({
    side: side as 'left' | 'right',
    score: 0.99,
    points: Array.from({ length: 21 }, (_, i) => ({ x: 0.05 + i * 0.012, y: 0.03 })),
  }));
  const [side, digit] = finger.split('-');
  const hand = hands.find((h) => h.side === side)!;
  hand.points[LANDMARK_TIPS[DIGITS.indexOf(digit as (typeof DIGITS)[number])]!] =
    key === ' ' ? { x: 0.5, y: 0.84 } : { ...c.points[key]! };
  return hands;
}
export function frame(
  id: number,
  at: number,
  key: string,
  finger: Finger,
  receivedAt = at + 20,
): Frame {
  return { id, at, receivedAt, clock: 'capture', hands: handsAt(key, finger) };
}

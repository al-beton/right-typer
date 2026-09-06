import type { Calibration, Finger, Frame, Observation, Press } from './types';
import { DIGITS, LANDMARK_TIPS } from './keyboard';
import { keyDistance } from './calibration';
export const WINDOW_MS = 100;
export const DEADLINE_MS = 1500;
function candidate(
  frame: Frame,
  key: string,
  calibration: Calibration,
): { finger: Finger; distance: number } | null {
  // Missing/duplicated hands are not evidence of absence of a competing finger.
  if (
    frame.hands.length !== 2 ||
    new Set(frame.hands.map((h) => h.side)).size !== 2 ||
    frame.hands.some((h) => h.score < 0.8 || h.points.length !== 21)
  )
    return null;
  const ranked = frame.hands
    .flatMap((hand) =>
      LANDMARK_TIPS.map((tip, i) => {
        const side = calibration.swapHands ? (hand.side === 'left' ? 'right' : 'left') : hand.side;
        return {
          finger: `${side}-${DIGITS[i]}` as Finger,
          distance: keyDistance(calibration, key, hand.points[tip]!),
        };
      }),
    )
    .sort((a, b) => a.distance - b.distance);
  const first = ranked[0]!,
    second = ranked[1]!;
  // Geometric hypotheses, intentionally isolated for tuning on the actual camera.
  if (
    !Number.isFinite(first.distance) ||
    first.distance > 0.8 ||
    second.distance - first.distance < 0.28
  )
    return null;
  return first;
}
export function attribute(
  press: Pick<Press, 'at' | 'key'>,
  frames: Frame[],
  calibration: Calibration,
): Observation {
  const nearby = frames.filter(
    (f) => f.clock === 'capture' && Number.isFinite(f.at) && Math.abs(f.at - press.at) <= WINDOW_MS,
  );
  // Two frames straddling the press, never "last completed inference".
  const before = nearby.filter((f) => f.at <= press.at).sort((a, b) => b.at - a.at)[0];
  const after = nearby.filter((f) => f.at > press.at).sort((a, b) => a.at - b.at)[0];
  if (!before || !after)
    return {
      kind: 'uncertain',
      reason:
        'No fresh camera frames on both sides of this press. Slow down slightly and check the camera timing.',
    };
  const a = candidate(before, press.key, calibration),
    b = candidate(after, press.key, calibration);
  if (!a || !b)
    return {
      kind: 'uncertain',
      reason:
        'The pressing finger was hidden, between keys, or too close to another fingertip. Keep both hands visible and check the key dots.',
    };
  if (a.finger !== b.finger)
    return {
      kind: 'uncertain',
      reason:
        'Nearby frames disagree about the pressing finger. Try a more deliberate press with both hands in view.',
    };
  return {
    kind: 'finger',
    finger: a.finger,
    frameIds: [before.id, after.id],
    distance: Math.max(a.distance, b.distance),
  };
}
// Owns evidence by immutable press/attempt identity. Late results cannot re-grade settled presses.
export class EvidenceBuffer {
  frames: Frame[] = [];
  private pending = new Map<
    number,
    { press: Press; calibration: Calibration; resolve: (o: Observation) => void }
  >();
  private inFlight = new Map<number, number>();
  private watermark = -Infinity;
  startFrame(id: number, at: number) {
    this.inFlight.set(id, at);
  }
  add(frame: Frame) {
    this.inFlight.delete(frame.id);
    if (!this.frames.some((f) => f.id === frame.id)) this.frames.push(frame);
    this.watermark = Math.max(this.watermark, frame.at);
    // Keep observations for long words by settling presses as they arrive, not at the boundary.
    this.frames = this.frames.filter((f) => f.at >= this.watermark - 4000);
  }
  request(press: Press, calibration: Calibration): Promise<Observation> {
    return new Promise((resolve) => this.pending.set(press.id, { press, calibration, resolve }));
  }
  tick(now: number) {
    for (const [id, p] of this.pending) {
      const due = p.press.at + WINDOW_MS;
      const waiting = [...this.inFlight.values()].some(
        (at) => Math.abs(at - p.press.at) <= WINDOW_MS,
      );
      if (now >= p.press.at + DEADLINE_MS || (now >= due && this.watermark > due && !waiting)) {
        p.resolve(
          waiting
            ? {
                kind: 'uncertain',
                reason:
                  'Tracking did not finish the nearby frames in time. Try a slower press or restart the camera.',
              }
            : attribute(p.press, this.frames, p.calibration),
        );
        this.pending.delete(id);
      }
    }
  }
  reset() {
    for (const p of this.pending.values())
      p.resolve({
        kind: 'uncertain',
        reason: 'Camera setup changed during this attempt. Please try the word again.',
      });
    this.pending.clear();
    this.frames = [];
    this.inFlight.clear();
    this.watermark = -Infinity;
  }
}

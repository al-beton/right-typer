import type { Calibration, Finger, Frame, Hand, Observation, Press, SeenHand } from './types';
import { DIGITS, LANDMARK_TIPS } from './keyboard';
import { keyDistance } from './calibration';
// A press is certain; the finger is the best available estimate. One rule, no vetoes:
// the frame nearest the press that shows any hand, then the fingertip nearest the key.
export const SEARCH_MS = 500;
export const DEADLINE_MS = 1000;
export function nearestFrame(at: number, frames: Frame[]): Frame | undefined {
  return frames
    .filter((f) => Number.isFinite(f.at) && f.hands.length > 0 && Math.abs(f.at - at) <= SEARCH_MS)
    .sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0];
}
// Model handedness with the user's swap applied. Two hands with the same label are told
// apart by position along the calibrated q→p axis, which is independent of camera mirroring.
export function handSides(hands: SeenHand[], c: Calibration): Hand[] {
  const flip = (s: Hand): Hand => (s === 'left' ? 'right' : 'left');
  const labelled = hands.map((h) => (c.swapHands ? flip(h.side) : h.side));
  const q = c.points.q,
    p = c.points.p;
  if (hands.length !== 2 || labelled[0] !== labelled[1] || !q || !p) return labelled;
  const along = (h: SeenHand) => {
    const n = h.points.length || 1;
    const cx = h.points.reduce((s, pt) => s + pt.x, 0) / n;
    const cy = h.points.reduce((s, pt) => s + pt.y, 0) / n;
    return (cx - q.x) * (p.x - q.x) + (cy - q.y) * (p.y - q.y);
  };
  return along(hands[0]!) <= along(hands[1]!) ? ['left', 'right'] : ['right', 'left'];
}
export function attribute(
  press: Pick<Press, 'at' | 'key'>,
  frames: Frame[],
  calibration: Calibration,
): Observation {
  const frame = nearestFrame(press.at, frames);
  if (!frame)
    return {
      kind: 'uncertain',
      reason: `No hands were seen within ${SEARCH_MS} ms of this press. Keep your hands in the picture.`,
    };
  const sides = handSides(frame.hands, calibration);
  const best = frame.hands
    .flatMap((hand, h) =>
      LANDMARK_TIPS.flatMap((tip, i) => {
        const point = hand.points[tip];
        if (!point) return [];
        return [
          {
            finger: `${sides[h]!}-${DIGITS[i]!}` as Finger,
            distance: keyDistance(calibration, press.key, point),
          },
        ];
      }),
    )
    .filter((c) => Number.isFinite(c.distance))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!best)
    return {
      kind: 'uncertain',
      reason: 'The nearby frame had hands without fingertip landmarks for this key.',
    };
  return {
    kind: 'finger',
    finger: best.finger,
    frameIds: [frame.id],
    distance: best.distance,
    offsetMs: frame.at - press.at,
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
  // Settle once a frame after the press has landed and no in-flight frame could be nearer,
  // or at the deadline with whatever evidence exists. Either way the press gets an answer.
  tick(now: number) {
    for (const [id, p] of this.pending) {
      const best = nearestFrame(p.press.at, this.frames);
      const gap = best ? Math.abs(best.at - p.press.at) : SEARCH_MS;
      const waiting = [...this.inFlight.values()].some((at) => Math.abs(at - p.press.at) < gap);
      if (now >= p.press.at + DEADLINE_MS || (this.watermark > p.press.at && !waiting)) {
        p.resolve(attribute(p.press, this.frames, p.calibration));
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

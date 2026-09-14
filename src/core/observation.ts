import type {
  Calibration,
  Finger,
  Frame,
  Hand,
  Observation,
  Press,
  SeenHand,
  Point,
} from './types';
import { DIGITS, LANDMARK_TIPS } from './keyboard';
import { keyDistance } from './calibration';
// A press is certain; the finger is the best available estimate:
// the frame nearest the press that shows any hand, then the uniquely nearest finger.
export const SEARCH_MS = 500;
export const DEADLINE_MS = 1000;
export function nearestFrame(at: number, frames: Frame[]): Frame | undefined {
  return frames
    .filter(
      (f) =>
        (f.clock === 'capture' || f.clock === 'estimated') &&
        Number.isFinite(f.at) &&
        f.hands.length > 0 &&
        Math.abs(f.at - at) <= SEARCH_MS,
    )
    .sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0];
}
// Model handedness with the user's swap applied. Two hands with the same label are told
// apart by position along the calibrated q→p axis, which is independent of camera mirroring.
export function handSides(hands: SeenHand[], c: Calibration): Hand[] {
  const flip = (s: Hand): Hand => (s === 'left' ? 'right' : 'left');
  const labelled = hands.map((h) => (c.swapHands ? flip(h.side) : h.side));
  const ordered = c.profile?.keys
    .filter((k) => c.points[k.code])
    .sort((a, b) => a.x + a.width / 2 - b.x - b.width / 2);
  const q = ordered?.length ? c.points[ordered[0]!.code] : c.points.q,
    p = ordered?.length ? c.points[ordered.at(-1)!.code] : c.points.p;
  if (hands.length !== 2 || labelled[0] !== labelled[1] || !q || !p) return labelled;
  const along = (h: SeenHand) => {
    const n = h.points.length || 1;
    const cx = h.points.reduce((s, pt) => s + pt.x, 0) / n;
    const cy = h.points.reduce((s, pt) => s + pt.y, 0) / n;
    return (cx - q.x) * (p.x - q.x) + (cy - q.y) * (p.y - q.y);
  };
  return along(hands[0]!) <= along(hands[1]!) ? ['left', 'right'] : ['right', 'left'];
}
export type AttributionDecision = {
  observation: Observation;
  frame?: Omit<Frame, 'hands'>;
  candidates: { finger: Finger; distance: number; point: Point; landmarkIndex: number }[];
};
export function inspectAttribution(
  press: Pick<Press, 'at' | 'key' | 'code'>,
  frames: Frame[],
  calibration: Calibration,
): AttributionDecision {
  const frame = nearestFrame(press.at, frames);
  if (!frame)
    return {
      candidates: [],
      observation: {
        kind: 'uncertain',
        reason: frames.some(
          (f) => f.clock === 'unavailable' && Math.abs(f.at - press.at) <= SEARCH_MS,
        )
          ? 'Camera capture timing was unavailable around this press.'
          : `No hands were seen within ${SEARCH_MS} ms of this press. Keep your hands in the picture.`,
      },
    };
  const sides = handSides(frame.hands, calibration);
  const candidates = frame.hands
    .flatMap((hand, h) =>
      LANDMARK_TIPS.flatMap((tip, i) => {
        const point = hand.points[tip];
        if (!point) return [];
        return [
          {
            finger: `${sides[h]!}-${DIGITS[i]!}` as Finger,
            distance: keyDistance(calibration, press.code ?? press.key, point),
            point: { ...point },
            landmarkIndex: tip,
          },
        ];
      }),
    )
    .filter((c) => Number.isFinite(c.distance))
    .sort((a, b) => a.distance - b.distance);
  const metadata = {
    id: frame.id,
    at: frame.at,
    receivedAt: frame.receivedAt,
    clock: frame.clock,
    ...(frame.timing ? { timing: frame.timing } : {}),
  };
  const result = (observation: Observation): AttributionDecision => ({
    observation,
    frame: structuredClone(metadata),
    candidates,
  });
  const best = candidates[0];
  if (!best)
    return result({
      kind: 'uncertain',
      reason: 'The nearby frame had hands without fingertip landmarks for this key.',
    });
  if (
    candidates.some(
      (candidate) => candidate.finger !== best.finger && candidate.distance === best.distance,
    )
  )
    return result({
      kind: 'uncertain',
      reason: 'Equally near fingertips could not be distinguished for this key.',
    });
  return result({
    kind: 'finger',
    finger: best.finger,
    frameIds: [frame.id],
    distance: best.distance,
    offsetMs: frame.at - press.at,
    ...(frame.timing ? { timing: structuredClone(frame.timing) } : {}),
  });
}
export function attribute(
  press: Pick<Press, 'at' | 'key' | 'code'>,
  frames: Frame[],
  calibration: Calibration,
): Observation {
  return inspectAttribution(press, frames, calibration).observation;
}
// Owns evidence by immutable press/attempt identity. Late results cannot re-grade settled presses.
export type EvidenceEvent =
  | { type: 'frame-start'; id: number; at: number }
  | { type: 'frame-result'; frame: Frame }
  | { type: 'request'; press: Press }
  | { type: 'tick'; at: number }
  | { type: 'reset' };
export class EvidenceBuffer {
  trace?: (event: EvidenceEvent) => void;
  inspectDecision?: (press: Press, calibration: Calibration, decision: AttributionDecision) => void;
  inspectRequest?: (press: Press) => void;
  clearInspection?: (preserveInspection?: boolean) => void;
  frames: Frame[] = [];
  private pending = new Map<
    number,
    { press: Press; calibration: Calibration; resolve: (o: Observation) => void }
  >();
  private inFlight = new Map<number, number>();
  private watermark = -Infinity;
  startFrame(id: number, at: number) {
    this.trace?.({ type: 'frame-start', id, at });
    this.inFlight.set(id, at);
  }
  add(frame: Frame) {
    this.trace?.({ type: 'frame-result', frame });
    this.inFlight.delete(frame.id);
    if (!this.frames.some((f) => f.id === frame.id)) this.frames.push(frame);
    this.watermark = Math.max(this.watermark, frame.at);
    // Keep observations for long words by settling presses as they arrive, not at the boundary.
    this.frames = this.frames.filter((f) => f.at >= this.watermark - 4000);
  }
  request(press: Press, calibration: Calibration): Promise<Observation> {
    this.trace?.({ type: 'request', press });
    this.inspectRequest?.(press);
    return new Promise((resolve) => this.pending.set(press.id, { press, calibration, resolve }));
  }
  // Settle once a frame after the press has landed and no in-flight frame could be nearer,
  // or at the deadline with whatever evidence exists. Either way the press gets an answer.
  tick(now: number) {
    if (this.pending.size) this.trace?.({ type: 'tick', at: now });
    for (const [id, p] of this.pending) {
      const best = nearestFrame(p.press.at, this.frames);
      const gap = best ? Math.abs(best.at - p.press.at) : SEARCH_MS;
      const waiting = [...this.inFlight.values()].some((at) => Math.abs(at - p.press.at) < gap);
      if (now >= p.press.at + DEADLINE_MS || (this.watermark > p.press.at && !waiting)) {
        const decision = inspectAttribution(p.press, this.frames, p.calibration);
        p.resolve(decision.observation);
        this.pending.delete(id);
        this.inspectDecision?.(p.press, p.calibration, structuredClone(decision));
      }
    }
  }
  reset(options: { preserveInspection?: boolean } = {}) {
    this.clearInspection?.(options.preserveInspection);
    this.trace?.({ type: 'reset' });
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

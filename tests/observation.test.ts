import { describe, expect, it } from 'vitest';
import { attribute, DEADLINE_MS, EvidenceBuffer, handSides } from '../src/core/observation';
import { calibration, frame } from './fixtures';
import { CALIBRATION_KEYS, EXPECTED } from '../src/core/keyboard';
import type { Press } from '../src/core/types';
import { validCalibration } from '../src/core/calibration';
import { frameTime, keyTime } from '../src/tracking/timing';

describe('camera evidence, independently from intended finger', () => {
  it.each(Object.entries(EXPECTED).filter(([k]) => CALIBRATION_KEYS.includes(k)))(
    'attributes correct %s using controlled landmark geometry',
    (key, finger) => {
      expect(attribute({ key, at: 100 }, [frame(1, 80, key, finger)], calibration())).toMatchObject(
        { kind: 'finger', finger, frameIds: [1], offsetMs: -20 },
      );
    },
  );
  it.each(['q', 'a', 'z', 'p', 'l', '.'])(
    'observes the intentionally wrong index on %s across hands/rows',
    (key) => {
      const finger = ['q', 'a', 'z'].includes(key) ? 'left-index' : 'right-index';
      expect(
        attribute({ key, at: 100 }, [frame(1, 120, key, finger)], calibration()),
      ).toMatchObject({ kind: 'finger', finger, offsetMs: 20 });
    },
  );
  it.each(['left-thumb', 'right-thumb', 'left-index'] as const)(
    'space observes %s, with no expected-finger substitution',
    (finger) => {
      expect(
        attribute({ key: ' ', at: 100 }, [frame(1, 80, ' ', finger)], calibration()),
      ).toMatchObject({ kind: 'finger', finger });
    },
  );
  it('uses the single nearest frame regardless of side, arrival order or stale results', () => {
    const frames = [
      frame(1, 20, 'a', 'left-little', 900),
      frame(4, 400, 'a', 'right-index', 450),
      frame(2, 130, 'a', 'left-ring', 200),
      frame(3, 60, 'a', 'left-middle', 300),
    ];
    expect(attribute({ key: 'a', at: 100 }, frames.reverse(), calibration())).toMatchObject({
      kind: 'finger',
      finger: 'left-ring',
      frameIds: [2],
    });
  });
  it('skips a handless nearest frame and does not need frames on both sides of the press', () => {
    const empty = frame(2, 95, 'a', 'left-little');
    empty.hands = [];
    expect(
      attribute({ key: 'a', at: 100 }, [empty, frame(1, 0, 'a', 'left-little')], calibration()),
    ).toMatchObject({ kind: 'finger', finger: 'left-little', frameIds: [1] });
    expect(
      attribute({ key: 'a', at: 100 }, [empty, frame(3, 550, 'a', 'left-little')], calibration()),
    ).toMatchObject({ kind: 'finger', finger: 'left-little', frameIds: [3] });
  });
  it('attributes with one hand, a low handedness score, or a far fingertip', () => {
    const one = frame(1, 80, 'a', 'left-little');
    one.hands.pop();
    expect(attribute({ key: 'a', at: 100 }, [one], calibration())).toMatchObject({
      finger: 'left-little',
    });
    const low = frame(1, 80, 'a', 'left-little');
    low.hands[0]!.score = 0.3;
    expect(attribute({ key: 'a', at: 100 }, [low], calibration())).toMatchObject({
      finger: 'left-little',
    });
    // Every tip is far from every key, so the nearest tip on the nearest hand still answers.
    const far = frame(1, 80, 'q', 'left-little');
    expect(attribute({ key: '.', at: 100 }, [far], calibration())).toMatchObject({
      kind: 'finger',
    });
    const c = calibration();
    const ambiguous = frame(1, 80, 'a', 'left-little');
    ambiguous.hands[0]!.points[8] = { x: c.points.a!.x + 0.001, y: c.points.a!.y };
    expect(attribute({ key: 'a', at: 100 }, [ambiguous], c)).toMatchObject({
      finger: 'left-little',
    });
  });
  it('is unknown only when no hands were seen within the search window', () => {
    const empty = frame(1, 100, 'a', 'left-little');
    empty.hands = [];
    expect(attribute({ key: 'a', at: 100 }, [], calibration())).toMatchObject({
      kind: 'uncertain',
    });
    expect(attribute({ key: 'a', at: 100 }, [empty], calibration())).toMatchObject({
      kind: 'uncertain',
    });
    expect(
      attribute({ key: 'a', at: 100 }, [frame(2, 700, 'a', 'left-little')], calibration()).kind,
    ).toBe('uncertain');
  });
  it('relabels two same-side hands by position along the calibrated keyboard', () => {
    const c = calibration();
    const both = frame(1, 80, 'a', 'left-little');
    // The model calls both hands right; the one over the q side is the physical left.
    both.hands[0]!.side = 'right';
    both.hands[0]!.points = both.hands[0]!.points.map((p, i) =>
      i === 20 ? p : { x: 0.1, y: 0.5 },
    );
    both.hands[1]!.points = both.hands[1]!.points.map(() => ({ x: 0.8, y: 0.5 }));
    expect(attribute({ key: 'a', at: 100 }, [both], c)).toMatchObject({ finger: 'left-little' });
    expect(handSides(both.hands, c)).toEqual(['left', 'right']);
    expect(handSides([both.hands[1]!, both.hands[0]!], c)).toEqual(['right', 'left']);
    const single = frame(2, 80, 'a', 'right-index');
    single.hands.shift();
    expect(handSides(single.hands, c)).toEqual(['right']);
  });
  it('supports explicitly checked hand-label inversion', () => {
    const c = calibration();
    c.swapHands = true;
    expect(attribute({ key: 'a', at: 100 }, [frame(1, 80, 'a', 'right-little')], c)).toMatchObject({
      kind: 'finger',
      finger: 'left-little',
    });
  });
});
describe('evidence lifecycle', () => {
  const press: Press = { id: 1, attemptId: 7, key: 'a', at: 100 };
  it('waits for an in-flight nearer frame even when a later frame finishes first', async () => {
    const buffer = new EvidenceBuffer();
    let settled = false;
    const result = buffer.request(press, calibration()).then((r) => {
      settled = true;
      return r;
    });
    buffer.startFrame(1, 90);
    buffer.startFrame(2, 120);
    buffer.add(frame(2, 120, 'a', 'left-index'));
    buffer.add(frame(3, 220, 'b', 'left-index'));
    buffer.tick(300);
    await Promise.resolve();
    expect(settled).toBe(false);
    buffer.add(frame(1, 90, 'a', 'left-little', 500));
    buffer.tick(500);
    expect(await result).toMatchObject({ kind: 'finger', finger: 'left-little', frameIds: [1] });
  });
  it('does not wait for an in-flight frame that is farther than the best completed one', async () => {
    const buffer = new EvidenceBuffer();
    const result = buffer.request(press, calibration());
    buffer.add(frame(1, 110, 'a', 'left-little'));
    buffer.startFrame(2, 150);
    buffer.tick(200);
    expect(await result).toMatchObject({ kind: 'finger', finger: 'left-little', frameIds: [1] });
  });
  it('answers at the deadline with the evidence it has; later results cannot revise it', async () => {
    const buffer = new EvidenceBuffer();
    const result = buffer.request(press, calibration());
    buffer.add(frame(1, 0, 'a', 'left-ring'));
    buffer.startFrame(2, 95);
    buffer.tick(100 + DEADLINE_MS - 1);
    buffer.tick(100 + DEADLINE_MS);
    expect(await result).toMatchObject({ kind: 'finger', finger: 'left-ring', frameIds: [1] });
    buffer.add(frame(2, 95, 'a', 'left-little'));
    buffer.tick(2000);
    expect(await result).toMatchObject({ finger: 'left-ring' });
  });
  it('times out as unknown only when nothing showed hands', async () => {
    const buffer = new EvidenceBuffer();
    const result = buffer.request(press, calibration());
    buffer.tick(100 + DEADLINE_MS);
    expect((await result).kind).toBe('uncertain');
    buffer.add(frame(1, 80, 'a', 'left-little'));
    buffer.tick(2000);
    expect((await result).kind).toBe('uncertain');
  });
  it('owns multiple press/word/retry observations by ID, not arrival order', async () => {
    const buffer = new EvidenceBuffer();
    const a = buffer.request(press, calibration());
    const b = buffer.request({ id: 2, attemptId: 8, key: 'a', at: 500 }, calibration());
    [
      frame(4, 520, 'a', 'right-index'),
      frame(3, 490, 'a', 'right-middle'),
      frame(2, 120, 'a', 'left-ring'),
      frame(1, 80, 'a', 'left-little'),
      frame(5, 700, 'b', 'left-index'),
    ].forEach((f) => buffer.add(f));
    buffer.tick(800);
    expect(await a).toMatchObject({ finger: 'left-ring' });
    expect(await b).toMatchObject({ finger: 'right-middle' });
  });
  it('clears pending evidence when camera changes', async () => {
    const buffer = new EvidenceBuffer();
    const result = buffer.request(press, calibration());
    buffer.reset();
    expect((await result).kind).toBe('uncertain');
    expect(buffer.frames).toEqual([]);
  });
});
describe('timestamps and calibration validation', () => {
  it('uses native capture timestamps without subtracting inference time', () => {
    expect(frameTime({ captureTime: 70 }, 130)).toBe(70);
    // Captured from Chromium: rVFC now=2437.8, capture=2444.2, actual clock=2444.5.
    expect(frameTime({ captureTime: 2444.2 }, 2444.5)).toBe(2444.2);
    expect(frameTime({}, 130)).toBe(null);
    expect(frameTime({ captureTime: 140 }, 130)).toBe(null);
    expect(frameTime({ captureTime: 10 }, 3000)).toBe(null);
    expect(keyTime({ timeStamp: 100 }, 500, 1700000000000)).toBe(100);
    expect(keyTime({ timeStamp: 1700000000100 }, 500, 1700000000000)).toBe(100);
  });
  it('rejects corrupt, incomplete, or overlapping calibration', () => {
    expect(validCalibration(calibration())).toBe(true);
    expect(validCalibration(null)).toBe(false);
    const c = calibration();
    delete c.points.a;
    expect(validCalibration(c)).toBe(false);
    const duplicate = calibration();
    duplicate.points.a = duplicate.points.q!;
    expect(validCalibration(duplicate)).toBe(false);
  });
});

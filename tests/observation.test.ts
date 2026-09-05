import { describe, expect, it } from 'vitest';
import { attribute, EvidenceBuffer } from '../src/core/observation';
import { calibration, frame, handsAt } from './fixtures';
import { CALIBRATION_KEYS, EXPECTED } from '../src/core/keyboard';
import type { Frame, Press } from '../src/core/types';
import { validCalibration } from '../src/core/calibration';
import { frameTime, keyTime } from '../src/tracking/timing';

describe('camera evidence, independently from intended finger', () => {
  it.each(Object.entries(EXPECTED).filter(([k]) => CALIBRATION_KEYS.includes(k)))(
    'attributes correct %s using controlled landmark geometry',
    (key, finger) => {
      expect(
        attribute(
          { key, at: 100 },
          [frame(1, 80, key, finger), frame(2, 120, key, finger)],
          calibration(),
        ),
      ).toMatchObject({ kind: 'finger', finger });
    },
  );
  it.each(['q', 'a', 'z', 'p', 'l', '.'])(
    'observes the intentionally wrong index on %s across hands/rows',
    (key) => {
      const finger = ['q', 'a', 'z'].includes(key) ? 'left-index' : 'right-index';
      expect(
        attribute(
          { key, at: 100 },
          [frame(1, 80, key, finger), frame(2, 120, key, finger)],
          calibration(),
        ),
      ).toMatchObject({ kind: 'finger', finger });
    },
  );
  it.each(['left-thumb', 'right-thumb', 'left-index'] as const)(
    'space observes %s, with no expected-finger substitution',
    (finger) => {
      expect(
        attribute(
          { key: ' ', at: 100 },
          [frame(1, 80, ' ', finger), frame(2, 120, ' ', finger)],
          calibration(),
        ),
      ).toMatchObject({ kind: 'finger', finger });
    },
  );
  it('ignores inference completion order and stale unrelated results', () => {
    const frames = [
      frame(1, 80, 'a', 'left-little', 900),
      frame(4, 400, 'a', 'right-index', 450),
      frame(2, 120, 'a', 'left-little', 200),
    ];
    expect(attribute({ key: 'a', at: 100 }, frames.reverse(), calibration())).toMatchObject({
      kind: 'finger',
      finger: 'left-little',
      frameIds: [1, 2],
    });
  });
  it('returns uncertainty for dropped frames, missing hands, ambiguous fingers, or low hand scores', () => {
    expect(
      attribute(
        { key: 'a', at: 100 },
        [frame(1, 0, 'a', 'left-little'), frame(2, 250, 'a', 'left-little')],
        calibration(),
      ).kind,
    ).toBe('uncertain');
    for (const mutation of [
      (f: Frame) => f.hands.pop(),
      (f: Frame) => {
        f.hands[0]!.score = 0.5;
      },
      (f: Frame) => {
        f.hands[0]!.points[8] = calibration().points.a!;
      },
    ]) {
      const a = frame(1, 80, 'a', 'left-little'),
        b = frame(2, 120, 'a', 'left-little');
      mutation(a);
      expect(attribute({ key: 'a', at: 100 }, [a, b], calibration()).kind).toBe('uncertain');
    }
  });
  it('does not trust duplicate handedness, missing capture clocks, or disagreeing nearby frames', () => {
    const before = frame(1, 80, 'a', 'left-little'),
      after = frame(2, 120, 'a', 'left-little');
    before.hands[1]!.side = 'left';
    expect(attribute({ key: 'a', at: 100 }, [before, after], calibration()).kind).toBe('uncertain');
    before.hands = handsAt('a', 'right-index');
    expect(attribute({ key: 'a', at: 100 }, [before, after], calibration()).kind).toBe('uncertain');
    before.clock = 'unavailable';
    expect(attribute({ key: 'a', at: 100 }, [before, after], calibration()).kind).toBe('uncertain');
  });
  it('supports explicitly checked hand-label inversion', () => {
    const c = calibration();
    c.swapHands = true;
    expect(
      attribute(
        { key: 'a', at: 100 },
        [frame(1, 80, 'a', 'right-little'), frame(2, 120, 'a', 'right-little')],
        c,
      ),
    ).toMatchObject({ kind: 'finger', finger: 'left-little' });
  });
});
describe('evidence lifecycle', () => {
  const press: Press = { id: 1, attemptId: 7, key: 'a', at: 100 };
  it('waits for an in-flight nearby frame even when a later frame finishes first', async () => {
    const buffer = new EvidenceBuffer();
    let settled = false;
    const result = buffer.request(press, calibration()).then((r) => {
      settled = true;
      return r;
    });
    buffer.startFrame(1, 80);
    buffer.startFrame(2, 120);
    buffer.add(frame(2, 120, 'a', 'left-little'));
    buffer.add(frame(3, 220, 'b', 'left-index'));
    buffer.tick(300);
    await Promise.resolve();
    expect(settled).toBe(false);
    buffer.add(frame(1, 80, 'a', 'left-little', 500));
    buffer.tick(500);
    expect(await result).toMatchObject({ kind: 'finger', finger: 'left-little' });
  });
  it('times out honestly, and later results cannot revise a settled press', async () => {
    const buffer = new EvidenceBuffer();
    const result = buffer.request(press, calibration());
    buffer.tick(1600);
    expect((await result).kind).toBe('uncertain');
    buffer.add(frame(1, 80, 'a', 'left-little'));
    buffer.add(frame(2, 120, 'a', 'left-little'));
    buffer.tick(2000);
    expect((await result).kind).toBe('uncertain');
  });
  it('owns multiple press/word/retry observations by ID, not arrival order', async () => {
    const buffer = new EvidenceBuffer();
    const a = buffer.request(press, calibration());
    const b = buffer.request({ id: 2, attemptId: 8, key: 'a', at: 500 }, calibration());
    [
      frame(4, 520, 'a', 'right-index'),
      frame(3, 480, 'a', 'right-index'),
      frame(2, 120, 'a', 'left-little'),
      frame(1, 80, 'a', 'left-little'),
      frame(5, 700, 'b', 'left-index'),
    ].forEach((f) => buffer.add(f));
    buffer.tick(800);
    expect(await a).toMatchObject({ finger: 'left-little' });
    expect(await b).toMatchObject({ finger: 'right-index' });
  });
  it('does not ignore an unfinished closer frame when the deadline expires', async () => {
    const buffer = new EvidenceBuffer();
    const result = buffer.request(press, calibration());
    buffer.add(frame(1, 70, 'a', 'left-little'));
    buffer.add(frame(2, 130, 'a', 'left-little'));
    buffer.startFrame(3, 110);
    buffer.tick(1600);
    expect((await result).kind).toBe('uncertain');
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

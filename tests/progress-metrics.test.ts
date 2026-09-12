import { describe, it, expect } from 'vitest';
import {
  Progress,
  emptyData,
  getCohort,
  signature,
  targetId,
  type InputSnapshot,
} from '../src/curriculum/progress';
import { recordActivity } from '../src/curriculum/activity';
import { PRESETS } from '../src/core/profile';
import { parseProgress } from '../src/curriculum/storage';
import { ratio } from '../src/view/progress';
import { Exercise } from '../src/core/exercise';
import type { Finger, Observation } from '../src/core/types';
const profile = PRESETS[0]!;
const observed = (finger: Finger): Observation => ({
  kind: 'finger',
  finger,
  frameIds: [1],
  offsetMs: 0,
  distance: 0,
});
const unknown: Observation = { kind: 'uncertain', reason: 'No hands' };
function fixture() {
  const data = emptyData(),
    c = getCohort(data, signature(profile, 'standard'), 100);
  const progress = new Progress(
    c,
    () => {},
    (ms, start, end) => recordActivity(data.activity, ms, start, end),
  );
  return { data, c, progress };
}
const input = (at: number, patch: Partial<InputSnapshot> = {}): InputSnapshot => ({
  at,
  wall: new Date(2026, 8, 12, 12).getTime() + at,
  code: 'KeyN',
  expected: { character: 'n', code: 'KeyN' },
  correct: true,
  correctPrefix: true,
  word: 'en-v1-0046',
  round: 1,
  allowed: ['right-index'],
  ...patch,
});
describe('honest cumulative metrics', () => {
  it('an / a x Backspace n Space preserves 3/4 text, target N 1/2 and erased-finger veto', () => {
    const { c, progress } = fixture(),
      exercise = new Exercise(['an']);
    const press = (
      key: string,
      code: string,
      expected: string,
      finger: Finger,
      allowed: Finger[],
      at: number,
      correct: boolean,
      prefix: boolean,
    ) => {
      const p = exercise.press(key, at)!;
      p.code = code;
      p.allowedFingers = allowed;
      const handle = progress.accept(
        input(at, {
          code,
          expected: {
            character: expected,
            code: expected === ' ' ? 'Space' : `Key${expected.toUpperCase()}`,
          },
          allowed,
          correct,
          correctPrefix: prefix,
        }),
      );
      progress.observe(handle, observed(finger));
      exercise.observe(p.id, p.attemptId, observed(finger));
    };
    press('a', 'KeyA', 'a', 'left-little', ['left-little'], 0, true, true);
    press('x', 'KeyX', 'n', 'left-index', ['left-ring'], 400, false, false);
    progress.correction(500, input(500).wall);
    exercise.backspace();
    press('n', 'KeyN', 'n', 'right-index', ['right-index'], 900, true, true);
    press(' ', 'Space', ' ', 'right-thumb', ['left-thumb', 'right-thumb'], 1100, true, true);
    expect([c.correct, c.total, c.corrections]).toEqual([3, 4, 1]);
    expect(c.targets[targetId('n', 'KeyN')]).toMatchObject({ correct: 1, total: 2 });
    expect(c.actual.KeyX).toMatchObject({ total: 1, observed: 1, compliant: 0, handCompliant: 1 });
    expect(exercise.settle()).toMatchObject({ pass: false, textWrong: false });
    expect(c.activeMs).toBe(1100);
  });
  it('keeps 6/8 compliance separate from 8/10 coverage and same-hand 8/8', () => {
    const { c, progress } = fixture();
    for (let i = 0; i < 10; i++) {
      const handle = progress.accept(input(i * 100));
      progress.observe(
        handle,
        i < 6 ? observed('right-index') : i < 8 ? observed('right-ring') : unknown,
      );
    }
    expect(c.actual.KeyN).toMatchObject({
      total: 10,
      observed: 8,
      compliant: 6,
      handCompliant: 8,
      unknown: 2,
    });
    expect(ratio(6, 8)).toBe('75.0% (6/8) · Limited evidence');
    expect(ratio(0, 0)).toBe('No data');
    expect(ratio(19, 20)).toBe('95.0% (19/20)');
  });
  it('uses only observed thumbs for the Space side split', () => {
    const { c, progress } = fixture();
    for (let i = 0; i < 10; i++) {
      const h = progress.accept(
        input(i * 100, {
          code: 'Space',
          expected: { character: ' ', code: 'Space' },
          allowed: ['left-thumb', 'right-thumb'],
        }),
      );
      progress.observe(
        h,
        i < 3
          ? observed('left-thumb')
          : i < 5
            ? observed('right-thumb')
            : i === 5
              ? observed('left-index')
              : unknown,
      );
    }
    expect(c.space).toEqual({ left: 3, right: 2, other: 1, unclassified: 0 });
    expect(c.actual.Space).toMatchObject({ observed: 6, unknown: 4, total: 10 });
    expect(ratio(c.space.left, c.space.left + c.space.right)).toBe(
      '60.0% (3/5) · Limited evidence',
    );
  });
  it('finalizes out of order once and preserves abandoned unknowns in the original cohort', () => {
    const { c, progress } = fixture();
    const first = progress.accept(input(0)),
      second = progress.accept(input(400));
    expect(progress.observe(second, observed('right-index'))).toBe(true);
    expect(progress.observe(second, unknown)).toBe(false);
    progress.abandon();
    expect(progress.observe(first, observed('right-index'))).toBe(false);
    expect(c.actual.KeyN).toMatchObject({ total: 2, observed: 1, unknown: 1 });
  });
});
describe('active time and local dates', () => {
  it('0/400/900 makes response 400/500 and active 900, excluding boundaries and idle', () => {
    const { c, data, progress } = fixture();
    progress.accept(input(0));
    progress.accept(input(400));
    progress.accept(input(900));
    expect(c.targets[targetId('n', 'KeyN')]!.timings.map((t) => t.ms)).toEqual([400, 500]);
    expect(c.activeMs).toBe(900);
    expect(data.activity.days[0]!.ms).toBe(900);
    progress.breakTiming();
    progress.accept(input(2000));
    progress.accept(input(8000)); // >5-second gap: zero, starts a new segment
    progress.accept(input(8400));
    expect(c.activeMs).toBe(1300);
    expect(c.excludedActivity).toBe(1);
    progress.breakTiming();
    progress.accept(input(8500));
    progress.correction(8800, input(8800).wall, true);
    progress.accept(input(9000));
    expect(c.activeMs).toBe(1800);
    expect(c.targets[targetId('n', 'KeyN')]!.timings.map((t) => t.ms)).toEqual([400, 500, 400]);
    progress.correction(9100, input(9100).wall, false);
    progress.accept(input(9200));
    expect(c.activeMs).toBe(1800);
  });
  it('splits monotonic duration across local midnight without persisting timestamps', () => {
    const { data, c, progress } = fixture();
    const midnight = new Date(2026, 8, 13).getTime();
    progress.accept(input(0, { wall: midnight - 400 }));
    progress.accept(input(900, { wall: midnight + 500 }));
    expect(data.activity.days).toEqual([
      { date: '2026-09-12', ms: 400 },
      { date: '2026-09-13', ms: 500 },
    ]);
    expect(c.activeMs).toBe(900);
    expect(JSON.stringify(data)).not.toContain(String(midnight));
  });
  it('clock jumps cannot invent duration and invalid wall dates stay undated', () => {
    const { data, c, progress } = fixture();
    progress.accept(input(0));
    progress.accept(input(400, { wall: input(0).wall! - 86400000 }));
    expect(c.activeMs).toBe(400);
    expect(data.activity.clockAnomalies).toBe(1);
    expect(data.activity.days).toEqual([{ date: '2026-09-11', ms: 400 }]);
    progress.accept(input(900, { wall: NaN }));
    expect(c.activeMs).toBe(900);
    expect(data.activity.undatedMs).toBe(500);
    expect(data.activity.clockAnomalies).toBe(2);
  });
});
describe('progress schema continuity', () => {
  it('upgrades adaptive v1 without inventing old active time or thumb sides', () => {
    const { data, c, progress } = fixture();
    const handle = progress.accept(
      input(0, {
        code: 'Space',
        expected: { character: ' ', code: 'Space' },
        allowed: ['left-thumb', 'right-thumb'],
      }),
    );
    progress.observe(handle, observed('left-thumb'));
    c.course.qualified = ['n'];
    const old = JSON.parse(JSON.stringify(data)) as {
      version: number;
      activity?: unknown;
      cohorts: Array<Record<string, unknown>>;
    };
    old.version = 1;
    delete old.activity;
    for (const c of old.cohorts) {
      delete c.activeMs;
      delete c.excludedActivity;
      delete c.space;
    }
    const restored = parseProgress(JSON.stringify(old));
    expect(restored.version).toBe(2);
    expect(restored.cohorts[0]).toMatchObject({
      signature: c.signature,
      total: 1,
      activeMs: 0,
      space: { left: 0, right: 0, other: 0, unclassified: 1 },
      course: { qualified: ['n'] },
    });
    expect(restored.activity.days).toEqual([]);
    expect(parseProgress(JSON.stringify(restored))).toEqual(restored);
  });
  it('rejects over-capacity dates, impossible counters and invalid dates', () => {
    const { data, c } = fixture();
    c.space.left = 1;
    expect(() => parseProgress(JSON.stringify(data))).toThrow();
    c.space.left = 0;
    data.activity.days = [{ date: '2026-02-30', ms: 1 }];
    expect(() => parseProgress(JSON.stringify(data))).toThrow();
    data.activity.days = Array.from({ length: 91 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
      ms: 10,
    }));
    expect(() => parseProgress(JSON.stringify(data))).toThrow();
  });
});

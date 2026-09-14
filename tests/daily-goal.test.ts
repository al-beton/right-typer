import { describe, it, expect } from 'vitest';
import { dailyGoal, isDailyGoal } from '../src/view/daily-goal';
import { recordActivity, localDate } from '../src/curriculum/activity';
import { emptyData, getCohort, signature, Progress } from '../src/curriculum/progress';
import { PRESETS } from '../src/core/profile';
import { load, save } from '../src/core/storage';
const wall = new Date(2026, 8, 13, 12).getTime();
describe('daily goals from the shared ledger', () => {
  it('does not round completion early, permits continuation and makes off presentation-only', () => {
    const ledger = emptyData().activity;
    ledger.days.push({ date: localDate(wall)!, ms: 599999 });
    expect(dailyGoal(ledger, 10, wall)).toMatchObject({ met: false, label: 'Today 9 / 10 min' });
    expect(dailyGoal(ledger, 10, wall).detail).toContain('9 min 59 s');
    ledger.days[0]!.ms = 600000;
    expect(dailyGoal(ledger, 10, wall)).toMatchObject({
      met: true,
      label: 'Daily goal met · 10 min today',
    });
    ledger.days[0]!.ms = 721000;
    expect(dailyGoal(ledger, 10, wall).label).toBe('Daily goal met · 12 min today');
    expect(dailyGoal(ledger, 0, wall)).toMatchObject({ ms: 721000, met: false, label: '' });
    expect(dailyGoal(ledger, 10, wall + 86400000)).toMatchObject({ ms: 0, met: false });
    expect(ledger.days[0]!.ms).toBe(721000);
  });
  it('validates and saves goal independently of progress and restores default for malformed values', () => {
    for (const value of [-1, 121, 1.5, NaN, Infinity, '10', null])
      expect(isDailyGoal(value)).toBe(false);
    for (const value of [0, 1, 10, 120]) expect(isDailyGoal(value)).toBe(true);
    let raw = '';
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    save({ dailyGoalMinutes: 0, keyboardView: 'response', results: [] }, storage);
    expect(load(storage)).toMatchObject({ dailyGoalMinutes: 0, keyboardView: 'response' });
    raw = JSON.stringify({ dailyGoalMinutes: 121, results: [] });
    expect(load(storage).dailyGoalMinutes).toBe(10);
  });
  it('uses real inter-action activity once across correction, abandonment, idle and duplicate observations', () => {
    const data = emptyData(),
      c = getCohort(data, signature(PRESETS[0]!, 'standard'), 1);
    const p = new Progress(
      c,
      () => {},
      (ms, start, end, changed) => recordActivity(data.activity, ms, start, end, changed),
    );
    const accept = (at: number) =>
      p.accept({
        at,
        wall: wall + at,
        code: 'KeyA',
        expected: { character: 'a', code: 'KeyA' },
        correct: true,
        correctPrefix: true,
        allowed: ['left-little'],
        word: 'en-v1-0046',
        round: 1,
      });
    accept(0);
    const last = accept(400);
    p.correction(900, wall + 900, true);
    p.abandon();
    p.observe(last, { kind: 'uncertain', reason: 'fixture' });
    p.observe(last, { kind: 'uncertain', reason: 'fixture' });
    expect(dailyGoal(data.activity, 10, wall).ms).toBe(900);
    accept(1000);
    accept(7001);
    p.breakTiming();
    accept(8000);
    expect(dailyGoal(data.activity, 10, wall).ms).toBe(900);
  });
  it('preserves calendar buckets through DST and assigns ambiguous timezone-change intervals only to their endpoint', () => {
    const old = process.env.TZ;
    try {
      process.env.TZ = 'Europe/Berlin';
      const spring = Date.parse('2026-03-29T00:59:59.600Z'),
        ledger = emptyData().activity;
      recordActivity(ledger, 900, spring, spring + 900);
      expect(ledger.days).toEqual([{ date: '2026-03-29', ms: 900 }]);
      const fall = Date.parse('2026-10-25T00:59:59.600Z');
      recordActivity(ledger, 900, fall, fall + 900);
      expect(ledger.days[1]).toEqual({ date: '2026-10-25', ms: 900 });
      process.env.TZ = 'UTC';
      const data = emptyData(),
        c = getCohort(data, signature(PRESETS[0]!, 'standard'), 1);
      const p = new Progress(
        c,
        () => {},
        (ms, start, end, changed) => recordActivity(data.activity, ms, start, end, changed),
      );
      const start = Date.parse('2026-09-12T21:59:59.600Z');
      p.correction(0, start, true);
      process.env.TZ = 'Europe/Berlin';
      p.correction(900, start + 900, true);
      expect(data.activity.days).toEqual([{ date: '2026-09-13', ms: 900 }]);
      expect(data.activity.clockAnomalies).toBe(1);
      const snapshot = JSON.stringify(data.activity);
      process.env.TZ = 'UTC';
      expect(dailyGoal(data.activity, 10, start + 900).ms).toBe(0);
      expect(JSON.stringify(data.activity)).toBe(snapshot);
    } finally {
      if (old === undefined) delete process.env.TZ;
      else process.env.TZ = old;
    }
  });
});

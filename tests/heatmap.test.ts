import { describe, it, expect } from 'vitest';
import { keyMetric, keyDetail, summarizedOutput, isKeyboardView } from '../src/view/heatmap';
import { emptyData, getCohort, signature, targetId } from '../src/curriculum/progress';
import { PRESETS } from '../src/core/profile';
import { load, save } from '../src/core/storage';
const profile = PRESETS[0]!;
const cohort = () => getCohort(emptyData(), signature(profile, 'standard'), 1);
describe('keyboard heatmap semantics', () => {
  it('keeps prompted target errors separate from observed actual-key compliance and unknown coverage', () => {
    const c = cohort();
    c.targets[targetId('n', 'KeyN')] = {
      character: 'n',
      code: 'KeyN',
      total: 2,
      correct: 1,
      recent: [],
      timings: [],
      excludedTimings: 0,
    };
    c.actual.KeyX = {
      total: 10,
      observed: 8,
      compliant: 6,
      handCompliant: 8,
      unknown: 2,
      recent: [],
    };
    expect(keyMetric(c, 'KeyN', 'n', 'accuracy')).toMatchObject({
      value: 50,
      count: 2,
      state: 'limited',
    });
    expect(keyMetric(c, 'KeyX', 'x', 'accuracy').state).toBe('none');
    expect(keyMetric(c, 'KeyX', 'x', 'finger')).toMatchObject({
      value: 75,
      numerator: 6,
      denominator: 8,
    });
    expect(keyMetric(c, 'KeyX', 'x', 'hand').value).toBe(100);
    expect(keyMetric(c, 'KeyX', 'x', 'coverage').value).toBe(80);
    c.actual.KeyX = {
      total: 20,
      observed: 0,
      compliant: 0,
      handCompliant: 0,
      unknown: 20,
      recent: [],
    };
    expect(keyMetric(c, 'KeyX', 'x', 'finger')).toMatchObject({ value: undefined, state: 'none' });
    expect(keyMetric(c, 'KeyX', 'x', 'coverage')).toMatchObject({ value: 0, state: 'normal' });
    c.actual.KeyX.unknown = 19;
    expect(keyMetric(c, 'KeyX', 'x', 'coverage')).toMatchObject({
      count: 19,
      state: 'limited',
      pending: 1,
    });
    c.actual.KeyX.unknown = 0;
    expect(keyMetric(c, 'KeyX', 'x', 'coverage')).toMatchObject({ state: 'none', pending: 20 });
  });
  it('clamps the fixed color scale only, preserving real median, count, exclusions and neutral thresholds', () => {
    const c = cohort();
    const t = (c.targets[targetId('n', 'KeyN')] = {
      character: 'n',
      code: 'KeyN',
      total: 20,
      correct: 20,
      recent: [],
      timings: Array.from({ length: 20 }, () => ({ ms: 1800, word: 'test', round: 1 })),
      excludedTimings: 3,
    });
    expect(keyMetric(c, 'KeyN', 'n', 'response')).toMatchObject({
      value: 1800,
      score: 0,
      state: 'normal',
      count: 20,
    });
    expect(keyMetric(c, 'KeyN', 'n', 'response').evidence).toContain('3 lifetime exclusions');
    t.timings.forEach((t) => (t.ms = 100));
    expect(keyMetric(c, 'KeyN', 'n', 'response')).toMatchObject({
      value: 100,
      score: 1,
      amount: '100 ms',
    });
    t.timings.pop();
    expect(keyMetric(c, 'KeyN', 'n', 'response').color).toBe('#e8e8e3');
  });
  it('selects one curriculum output per physical key and reports truthful Space thumb denominators', () => {
    const p = structuredClone(profile),
      c = cohort();
    const k = p.keys.find((k) => k.code === 'KeyA')!;
    p.keys = p.keys.filter((k) => k.code !== 'KeyN');
    k.outputs.push({ text: 'n', shift: true, altGr: false });
    expect(summarizedOutput(k, p, c, 'n')).toBe('n');
    expect(summarizedOutput(k, p, c, 'z')).toBe('n'); // n precedes a in the active curriculum
    c.space = { left: 3, right: 2, other: 1, unclassified: 0 };
    c.actual.Space = {
      total: 10,
      observed: 6,
      compliant: 5,
      handCompliant: 6,
      unknown: 4,
      recent: [],
    };
    const html = keyDetail(c, p, 'Space', 'a', 'coverage', 'standard', 1);
    expect(html).toContain('60.0% (3/5)');
    expect(html).toContain('40.0% (2/5)');
    expect(html).toContain('60.0% (6/10)');
    expect(html).toContain('does not imply a preferred thumb');
    expect(keyDetail(c, p, 'KeyA', 'n', 'accuracy', 'standard', 1)).toContain('Other outputs: a');
  });
  it('persists a validated view preference without replacing other saved settings', () => {
    let raw = '';
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    save(
      { profileId: profile.id, keyboardView: 'coverage', results: [], fingeringMode: 'either' },
      storage,
    );
    expect(load(storage)).toMatchObject({
      keyboardView: 'coverage',
      fingeringMode: 'either',
      profileId: profile.id,
    });
    raw = JSON.stringify({ keyboardView: 'unknown', results: [] });
    expect(load(storage).keyboardView).toBe('fingers');
    expect(isKeyboardView('__proto__')).toBe(false);
  });
});

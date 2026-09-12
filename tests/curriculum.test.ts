import { describe, expect, it } from 'vitest';
import { PRESETS, characterKey } from '../src/core/profile';
import {
  Progress,
  ORDER,
  emptyData,
  getCohort,
  signature,
  targetId,
  type InputSnapshot,
} from '../src/curriculum/progress';
import {
  completeRound,
  generateRound,
  qualifies,
  roundWords,
  selectFocus,
  WORDS_BY_ID,
} from '../src/curriculum/selection';
import { parseProgress, MAX_BYTES } from '../src/curriculum/storage';
const profile = PRESETS[0]!;
const cohort = () => getCohort(emptyData(), signature(profile, 'standard'), 1234);
const wordIds = [...WORDS_BY_ID.keys()].slice(0, 3);
function ready(c = cohort(), key = 'e', attempts = 20, correct = 19, ms = 600) {
  const code = characterKey(profile, key)!.code;
  c.targets[targetId(key, code)] = {
    character: key,
    code,
    total: attempts,
    correct: attempts,
    excludedTimings: 0,
    recent: Array.from({ length: attempts }, (_, i) => ({
      correct: i < correct,
      word: wordIds[i % 3]!,
      round: (i % 2) + 1,
    })),
    timings: Array.from({ length: attempts }, (_, i) => ({
      ms,
      word: wordIds[i % 3]!,
      round: (i % 2) + 1,
    })),
  };
  return c;
}
const input = (at: number, patch: Partial<InputSnapshot> = {}): InputSnapshot => ({
  code: 'KeyN',
  expected: { character: 'n', code: 'KeyN' },
  correct: true,
  correctPrefix: true,
  allowed: ['right-index'],
  word: wordIds[0]!,
  round: 1,
  at,
  ...patch,
});
describe('adaptive curriculum', () => {
  it('generates 12 eligible real words at every stage with 8 focus and 4 review slots', () => {
    for (let included = 7; included <= ORDER.length; included++) {
      const c = cohort();
      c.course.included = included;
      c.course.qualified = ORDER.slice(0, included - 1);
      for (let n = 0; n < 3; n++) {
        const round = generateRound(c, profile);
        expect(round.slots).toHaveLength(12);
        expect(
          round.slots.filter((_, i) => i % 3 !== 2).every((slot) => slot.target === round.focus),
        ).toBe(true);
        expect(
          roundWords(round).every((word) =>
            [...word].every((key) => ORDER.slice(0, included).includes(key)),
          ),
        ).toBe(true);
        expect(round.slots.every((slot) => WORDS_BY_ID.has(slot.word))).toBe(true);
        expect(
          round.slots.every(
            (slot) =>
              slot.target === ' ' ||
              (WORDS_BY_ID.get(slot.word)! + slot.mark).includes(slot.target),
          ),
        ).toBe(true);
      }
    }
  });
  it('continues deterministically after serialization and covers the review queue', () => {
    for (let included = 7; included <= ORDER.length; included++) {
      const c = cohort();
      c.course.included = included;
      generateRound(c, profile);
      const seen = new Set<string>();
      for (let i = 0; i < Math.ceil(included / 4); i++) {
        const clone = parseProgress(
          JSON.stringify({ version: 1, corpus: 'english-curated-v1', cohorts: [c] }),
        ).cohorts[0]!;
        const round = generateRound(c, profile);
        expect(generateRound(clone, profile)).toEqual(round);
        round.slots.filter((_, i) => i % 3 === 2).forEach((slot) => seen.add(slot.target));
      }
      expect([...seen].sort()).toEqual(ORDER.slice(0, included).sort());
    }
  });
  it('enforces qualification boundaries and diverse evidence', () => {
    expect(qualifies(ready(), profile, 'e')).toBe(true);
    expect(qualifies(ready(cohort(), 'e', 19, 19), profile, 'e')).toBe(false);
    expect(qualifies(ready(cohort(), 'e', 20, 18), profile, 'e')).toBe(false);
    expect(qualifies(ready(cohort(), 'e', 20, 20, 601), profile, 'e')).toBe(false);
    const c = ready(),
      t = c.targets[targetId('e', 'KeyE')]!;
    t.timings.forEach((item) => (item.round = 1));
    expect(qualifies(c, profile, 'e')).toBe(false);
    t.timings.forEach((item, i) => {
      item.round = (i % 2) + 1;
      item.word = wordIds[0]!;
    });
    expect(qualifies(c, profile, 'e')).toBe(false);
  });
  it('introduces at most one key per completion and never relocks', () => {
    const c = cohort();
    for (const key of ORDER) ready(c, key);
    completeRound(c, profile);
    expect(c.course.included).toBe(8);
    expect(c.course.round?.introduced).toBe('o');
    c.targets = {};
    completeRound(c, profile);
    expect(c.course.included).toBe(8);
    expect(c.course.qualified).toEqual(ORDER.slice(0, 7));
    for (const key of ORDER) ready(c, key);
    for (let i = 0; i < 40; i++) completeRound(c, profile);
    expect(c.course.included).toBe(29);
    expect(roundWords(c.course.round!)).toHaveLength(12);
  });
  it('does not call unknown fingers a weakness and prioritizes observed wrong fingers', () => {
    const c = cohort();
    c.course.qualified = ORDER.slice(0, 7);
    for (const key of ORDER.slice(0, 7)) ready(c, key, 20, 20, key === 'n' ? 700 : 500);
    c.actual.KeyE = {
      total: 32,
      observed: 0,
      compliant: 0,
      handCompliant: 0,
      unknown: 32,
      recent: Array.from({ length: 32 }, () => ({ outcome: 'unknown' })),
    };
    expect(selectFocus(c, profile)).toBe('n');
    c.actual.KeyE = {
      total: 20,
      observed: 20,
      compliant: 18,
      handCompliant: 20,
      unknown: 0,
      recent: Array.from({ length: 20 }, (_, i) => ({
        outcome: i < 18 ? 'compliant' : 'same-hand',
      })),
    };
    expect(selectFocus(c, profile)).toBe('e');
  });
  it('keeps names/calibration out of cohorts and separates resolved mapping policy', () => {
    const copy = structuredClone(profile);
    copy.name = 'Renamed';
    copy.id = 'custom';
    expect(signature(copy, 'standard')).toBe(signature(profile, 'standard'));
    copy.keys.find((key) => key.code === 'KeyN')!.standard = ['left-index'];
    expect(signature(copy, 'standard')).not.toBe(signature(profile, 'standard'));
  });
});
describe('accepted progress accounting', () => {
  it('separates the expected target from the physical wrong key and closes observations once', () => {
    const c = cohort(),
      p = new Progress(c);
    const handle = p.accept(
      input(100, { code: 'KeyX', correct: false, correctPrefix: false, allowed: ['left-ring'] }),
    );
    expect(c.targets[targetId('n', 'KeyN')]?.recent[0]?.correct).toBe(false);
    expect(c.targets[targetId('x', 'KeyX')]).toBeUndefined();
    expect(c.actual.KeyX?.total).toBe(1);
    p.abandon();
    expect(
      p.observe(handle, {
        kind: 'finger',
        finger: 'left-ring',
        frameIds: [1],
        distance: 0,
        offsetMs: 0,
      }),
    ).toBe(false);
    expect(c.actual.KeyX?.unknown).toBe(1);
  });
  it('keeps first-segment, correction, overflow and invalid response semantics', () => {
    const c = cohort(),
      p = new Progress(c);
    p.accept(input(100));
    p.accept(input(400));
    p.correction();
    p.accept(input(500));
    p.accept(input(501));
    p.accept(input(501));
    p.accept(input(6002));
    p.accept(input(6100, { expected: undefined, correct: false, correctPrefix: false }));
    const t = c.targets[targetId('n', 'KeyN')]!;
    expect(t.timings.map((item) => item.ms)).toEqual([300, 1]);
    expect(t.excludedTimings).toBe(2);
    expect(c.corrections).toBe(1);
    expect(c.total).toBe(7);
    expect(t.total).toBe(6);
  });
  it('bounds windows and turns interrupted pending observations into unknown', () => {
    const c = cohort(),
      p = new Progress(c);
    for (let i = 0; i < 80; i++) p.accept(input(i * 100));
    generateRound(c, profile);
    const restored = parseProgress(
      JSON.stringify({ version: 1, corpus: 'english-curated-v1', cohorts: [c] }),
    ).cohorts[0]!;
    expect(restored.targets[targetId('n', 'KeyN')]?.recent).toHaveLength(32);
    expect(restored.actual.KeyN?.unknown).toBe(80);
    expect(restored.actual.KeyN?.recent.every((item) => item.outcome === 'unknown')).toBe(true);
  });
  it('rejects corrupt, unsupported, over-capacity and invalid corpus progress', () => {
    expect(() => parseProgress('{')).toThrow();
    expect(() => parseProgress(JSON.stringify({ version: 2 }))).toThrow();
    expect(() => parseProgress(' '.repeat(MAX_BYTES + 1))).toThrow();
    const c = cohort();
    generateRound(c, profile);
    c.course.round!.slots[0]!.word = 'invented';
    expect(() =>
      parseProgress(JSON.stringify({ version: 1, corpus: 'english-curated-v1', cohorts: [c] })),
    ).toThrow();
  });
});

it('ships sufficient original starter and noninitial coverage with same-level finite fallbacks', async () => {
  const { default: corpus } = await import('../src/curriculum/corpus.json');
  const { default: fallbacks } = await import('../src/curriculum/fallback-pools.json');
  expect(corpus.words.length).toBeGreaterThanOrEqual(500);
  expect(corpus.words.length).toBeLessThanOrEqual(1500);
  expect(corpus.words.filter((w) => w.originalStarter).length).toBeGreaterThanOrEqual(30);
  for (let included = 7; included <= ORDER.length; included++) {
    const allowed = ORDER.slice(0, included);
    const eligible = corpus.words.filter((w) => [...w.text].every((k) => allowed.includes(k)));
    if (included === 7) expect(eligible.length).toBeGreaterThanOrEqual(30);
    for (const target of allowed.filter((k) => /[a-z]/.test(k))) {
      expect(eligible.filter((w) => w.text.includes(target)).length).toBeGreaterThanOrEqual(5);
      expect(
        eligible.filter((w) => w.text.slice(1).includes(target)).length,
      ).toBeGreaterThanOrEqual(3);
    }
    const pools = fallbacks.stages[included - 7]!.targets as Record<
      string,
      { wordId: string; text: string }[]
    >;
    for (const target of allowed) {
      expect(pools[target]!.length).toBeGreaterThanOrEqual(5);
      for (const entry of pools[target]!) {
        expect(WORDS_BY_ID.has(entry.wordId)).toBe(true);
        expect([...entry.text].every((k) => allowed.includes(k))).toBe(true);
        expect(target === ' ' || entry.text.includes(target)).toBe(true);
      }
    }
  }
});

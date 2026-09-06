import { describe, expect, it } from 'vitest';
import { Exercise, feedback, grade } from '../src/core/exercise';
import { EXPECTED } from '../src/core/keyboard';
import { PASSAGE, WORDS } from '../src/passage';
import { attribute, DEADLINE_MS, EvidenceBuffer } from '../src/core/observation';
import { calibration, frame } from './fixtures';
import { load, save, reset } from '../src/core/storage';
import type { Finger } from '../src/core/types';
const seen = (finger: Finger) => ({
  kind: 'finger' as const,
  finger,
  frameIds: [1, 2],
  distance: 0,
});
function unknown(e: Exercise, key: string, at: number) {
  const p = e.press(key, at)!;
  e.observe(p.id, p.attemptId, { kind: 'uncertain', reason: 'No hands' });
  return p;
}
function enter(e: Exercise, key: string, at: number, finger?: Finger) {
  const p = e.press(key, at)!;
  e.observe(p.id, p.attemptId, seen(finger ?? (key === ' ' ? 'right-thumb' : EXPECTED[key]!)));
  return p;
}
describe('word practice', () => {
  it('does not interrupt a word on a wrong finger, but refuses it at its boundary', () => {
    const e = new Exercise(['cat']);
    enter(e, 'c', 100, 'left-index');
    expect(e.state).toBe('typing');
    enter(e, 'a', 300);
    enter(e, 't', 500);
    enter(e, ' ', 700);
    expect(e.settle()).toMatchObject({ pass: false, textWrong: false, wrong: [{ key: 'c' }] });
    expect(e.index).toBe(0);
    expect(e.state).toBe('retry');
    expect(e.press('c', 900)).toBeNull();
    e.retry();
    enter(e, 'c', 1000);
    enter(e, 'a', 1200);
    enter(e, 't', 1400);
    enter(e, ' ', 1600);
    expect(e.settle()?.pass).toBe(true);
    expect(e.state).toBe('complete');
  });
  it('requires a fresh attempt after an erased wrong-finger press', () => {
    const e = new Exercise(['a']);
    enter(e, 'a', 100, 'left-index');
    e.backspace();
    enter(e, 'a', 300);
    enter(e, ' ', 500);
    expect(e.settle()?.pass).toBe(false);
    expect(e.stats(700).wrongFingers).toBe(1);
  });
  it('advances mixed correct and unknown presses without counting a retry', () => {
    const e = new Exercise(['a']);
    const p = e.press('a', 100)!;
    e.observe(p.id, p.attemptId, { kind: 'uncertain', reason: 'No hands' });
    enter(e, ' ', 300);
    expect(e.settle()).toMatchObject({ pass: true, wrong: [], textWrong: false });
    expect(e.stats(500)).toMatchObject({
      wrongFingers: 0,
      textMistakes: 0,
      retries: 0,
      passedWords: 1,
      uncertainPresses: 1,
    });
  });
  it('submitting space is observed and must use a thumb', () => {
    const e = new Exercise(['a']);
    enter(e, 'a', 100);
    enter(e, ' ', 300, 'right-index');
    expect(e.settle()?.wrong).toHaveLength(1);
  });
  it('locks boundary input, waits for unresolved evidence, rejects late/duplicate observations', () => {
    const e = new Exercise(['a', 'a']);
    const first = e.press('a', 100)!;
    enter(e, ' ', 300);
    expect(e.settle()).toBeNull();
    expect(e.press('a', 400)).toBeNull();
    e.observe(first.id, first.attemptId, seen('left-little'));
    expect(e.settle()?.pass).toBe(true);
    expect(e.observe(first.id, first.attemptId, seen('right-index'))).toBe(false);
    expect(e.index).toBe(1);
    const p = e.press('a', 500)!;
    expect(e.observe(p.id, p.attemptId, seen('left-little'))).toBe(true);
    expect(e.observe(p.id, p.attemptId, seen('right-index'))).toBe(false);
  });
  it('pause invalidates observations and resumes the same word with a fresh attempt', () => {
    const e = new Exercise(['a']);
    const p = e.press('a', 100)!;
    e.pause();
    expect(e.observe(p.id, p.attemptId, seen('left-little'))).toBe(false);
    e.retry();
    expect(e.attempt.id).not.toBe(p.attemptId);
    expect(e.index).toBe(0);
    expect(e.attempt.text).toBe('');
  });
  it('defines WPM over accepted characters and total time including retries, excluding inference after final space', () => {
    const e = new Exercise(['a']);
    enter(e, 'b', 0);
    enter(e, ' ', 1000);
    e.settle();
    e.retry();
    enter(e, 'a', 2000);
    enter(e, ' ', 60000);
    e.settle();
    expect(e.stats(90000)).toMatchObject({
      wpm: 0.4,
      elapsedMs: 60000,
      textMistakes: 1,
      retries: 1,
      attempts: 2,
      passedWords: 1,
    });
  });
  it('rejects unsupported inputs and empty space without starting the timer', () => {
    const e = new Exercise(['a']);
    expect(e.press(' ', 0)).toBeNull();
    expect(e.press('A', 0)).toBeNull();
    expect(e.press('Enter', 0)).toBeNull();
    expect(e.startedAt).toBeUndefined();
  });
  it('full synthetic passage: correct landmarks produce no false rejections at deliberate pace', () => {
    const e = new Exercise(WORDS);
    let at = 100,
      id = 0;
    for (const word of WORDS) {
      for (const key of word + ' ') {
        const finger = key === ' ' ? 'left-thumb' : EXPECTED[key]!;
        const p = e.press(key, at)!;
        const o = attribute(
          p,
          [frame(++id, at - 25, key, finger), frame(++id, at + 25, key, finger)],
          calibration(),
        );
        e.observe(p.id, p.attemptId, o);
        at += 200;
      }
      expect(e.settle()?.pass).toBe(true);
    }
    expect(e.state).toBe('complete');
    expect(e.stats(at)).toMatchObject({
      wrongFingers: 0,
      retries: 0,
      passedWords: WORDS.length,
    });
  });
  it('passage covers all letters with supported characters and approximately fifty words', () => {
    expect(PASSAGE).toMatch(/^[a-z ,.]+$/);
    expect(WORDS.length).toBeGreaterThanOrEqual(45);
    expect(WORDS.length).toBeLessThanOrEqual(55);
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') expect(PASSAGE).toContain(letter);
  });
  it('grades unknowns honestly, but a text mismatch still fails', () => {
    const attempt = {
      id: 1,
      wordIndex: 0,
      text: 'a',
      presses: [{ id: 1, attemptId: 1, key: 'a', at: 0 }],
    };
    expect(grade(attempt, 'a')).toMatchObject({ pass: true, uncertain: attempt.presses });
    expect(grade(attempt, 'b')).toMatchObject({ pass: false, textWrong: true });
  });
  it('accepts a full all-unknown passage, including spaces, without inventing fingers', () => {
    const e = new Exercise(WORDS);
    let at = 0;
    for (const word of WORDS) {
      for (const key of word + ' ') unknown(e, key, (at += 200));
      const verdict = e.settle()!;
      expect(verdict.pass).toBe(true);
      expect(feedback(verdict, word)).toContain(`I could not verify ${word.length + 1} presses`);
    }
    expect(e.state).toBe('complete');
    expect(
      e.history.flatMap((h) => h.attempt.presses).every((p) => p.observation?.kind === 'uncertain'),
    ).toBe(true);
    expect(e.stats(at)).toMatchObject({
      attempts: WORDS.length,
      passedWords: WORDS.length,
      retries: 0,
      textMistakes: 0,
      wrongFingers: 0,
      uncertainPresses: WORDS.join(' ').length + 1,
    });
  });
  it('accepts an unknown space alongside correct letters and counts erased unknowns', () => {
    const e = new Exercise(['a']);
    unknown(e, 'b', 0);
    e.backspace();
    enter(e, 'a', 200);
    unknown(e, ' ', 400);
    expect(e.settle()?.pass).toBe(true);
    expect(e.stats(400)).toMatchObject({
      uncertainPresses: 2,
      retries: 0,
      textMistakes: 0,
      wpm: 60,
    });
  });
  it('unknown presses cannot excuse an erased wrong finger or a text mismatch', () => {
    const e = new Exercise(['a']);
    enter(e, 'a', 0, 'left-index');
    e.backspace();
    unknown(e, 'a', 200);
    unknown(e, ' ', 400);
    expect(e.settle()).toMatchObject({ pass: false, textWrong: false, wrong: [{ key: 'a' }] });
    expect(e.state).toBe('retry');
    e.retry();
    unknown(e, 'b', 600);
    unknown(e, ' ', 800);
    expect(e.settle()).toMatchObject({ pass: false, textWrong: true, wrong: [] });
    e.retry();
    unknown(e, 'a', 1000);
    unknown(e, ' ', 1200);
    expect(e.settle()?.pass).toBe(true);
    expect(e.stats(1200)).toMatchObject({
      attempts: 3,
      passedWords: 1,
      retries: 2,
      wrongFingers: 1,
      textMistakes: 1,
      uncertainPresses: 6,
      wpm: 20,
    });
  });
  it('a confidently wrong space still vetoes an otherwise unknown word', () => {
    const e = new Exercise(['a']);
    unknown(e, 'a', 100);
    enter(e, ' ', 300, 'right-index');
    expect(e.settle()).toMatchObject({
      pass: false,
      wrong: [{ key: ' ' }],
      uncertain: [{ key: 'a' }],
    });
  });
  it('waits until the deadline, then advances unknowns once; late wrong evidence cannot regrade or leak', async () => {
    const e = new Exercise(['a', 'a']);
    const buffer = new EvidenceBuffer();
    const first = e.press('a', 100)!;
    const space = e.press(' ', 300)!;
    const observations = [first, space].map((p) =>
      buffer.request(p, calibration()).then((o) => e.observe(p.id, p.attemptId, o)),
    );
    buffer.startFrame(1, 80);
    buffer.tick(300 + DEADLINE_MS - 1);
    await Promise.resolve();
    expect(e.settle()).toBeNull();
    expect(e.press('x', 1700)).toBeNull();
    buffer.tick(300 + DEADLINE_MS);
    await Promise.all(observations);
    expect(e.settle()?.pass).toBe(true);
    const next = e.press('a', 2000)!;
    buffer.add(frame(1, 80, 'a', 'left-index', 2100));
    buffer.add(frame(2, 120, 'a', 'left-index', 2200));
    buffer.tick(2300);
    expect(e.observe(first.id, first.attemptId, seen('left-index'))).toBe(false);
    expect(next.observation).toBeUndefined();
    expect(e.history[0]!.verdict.uncertain).toHaveLength(2);
    expect(e.history).toHaveLength(1);
    expect(e.index).toBe(1);
    expect(e.settle()).toBeNull();
  });
});
describe('local persistence', () => {
  it('round-trips calibration, caps history, resets only its own key', () => {
    const map = new Map<string, string>([['other', 'untouched']]);
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    };
    expect(save({ calibration: calibration(), results: [] }, storage)).toBe(true);
    expect(load(storage).calibration).toEqual(calibration());
    expect(reset(storage)).toBe(true);
    expect(map.get('other')).toBe('untouched');
    expect(load(storage)).toEqual({ results: [], calibration: undefined });
  });
  it('loads legacy counts without relabeling retries as presses and preserves calibration on resave', () => {
    const legacy = {
      ...new Exercise(['a']).stats(0),
      date: '2026-09-05',
      uncertainPresses: 7,
      uncertaintyRetries: 3,
      retries: 4,
    };
    let raw = JSON.stringify({ calibration: calibration(), results: [legacy] });
    const storage = {
      getItem: () => raw,
      setItem: (_: string, value: string) => {
        raw = value;
      },
    };
    const saved = load(storage);
    expect(saved.results[0]).toMatchObject({
      gradingPolicy: 'verified-only',
      uncertainPresses: 7,
      retries: 4,
    });
    saved.results.push({
      ...new Exercise(['a']).stats(0),
      date: '2026-09-06',
      gradingPolicy: 'wrong-finger-veto',
    });
    expect(save(saved, storage)).toBe(true);
    expect(load(storage)).toEqual(saved);
    expect(load(storage).calibration).toEqual(calibration());
  });
  it('validates new results and still caps history at ten', () => {
    const result = {
      ...new Exercise(['a']).stats(0),
      date: '2026-09-06',
      gradingPolicy: 'wrong-finger-veto' as const,
    };
    const raw = JSON.stringify({
      results: [
        ...Array.from({ length: 12 }, () => result),
        { ...result, uncertainPresses: -1 },
        { ...result, gradingPolicy: 'unsupported' },
      ],
    });
    expect(load({ getItem: () => raw }).results).toEqual(Array(10).fill(result));
  });
  it('survives broken JSON, null data, and blocked or full storage', () => {
    expect(load({ getItem: () => '{broken' })).toEqual({ results: [] });
    expect(load({ getItem: () => 'null' })).toEqual({ results: [] });
    expect(
      save(
        { results: [] },
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
      ),
    ).toBe(false);
    expect(
      load({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toEqual({ results: [] });
  });
});

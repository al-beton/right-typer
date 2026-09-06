import { describe, expect, it } from 'vitest';
import { Exercise, grade } from '../src/core/exercise';
import { EXPECTED } from '../src/core/keyboard';
import { PASSAGE, WORDS } from '../src/passage';
import { attribute } from '../src/core/observation';
import { calibration, frame } from './fixtures';
import { load, save, reset } from '../src/core/storage';
import type { Finger } from '../src/core/types';
const seen = (finger: Finger) => ({
  kind: 'finger' as const,
  finger,
  frameIds: [1, 2],
  distance: 0,
});
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
  it('keeps uncertainty separate from learner mistakes and blocks unchecked progress', () => {
    const e = new Exercise(['a']);
    const p = e.press('a', 100)!;
    e.observe(p.id, p.attemptId, { kind: 'uncertain', reason: 'No hands' });
    enter(e, ' ', 300);
    expect(e.settle()).toMatchObject({ pass: false, wrong: [], textWrong: false });
    expect(e.stats(500)).toMatchObject({
      wrongFingers: 0,
      textMistakes: 0,
      uncertaintyRetries: 1,
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
      uncertaintyRetries: 0,
      passedWords: WORDS.length,
    });
  });
  it('passage covers all letters with supported characters and approximately fifty words', () => {
    expect(PASSAGE).toMatch(/^[a-z ,.]+$/);
    expect(WORDS.length).toBeGreaterThanOrEqual(45);
    expect(WORDS.length).toBeLessThanOrEqual(55);
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') expect(PASSAGE).toContain(letter);
  });
  it('grade never passes unobserved or text-mismatched attempts', () => {
    expect(
      grade(
        { id: 1, wordIndex: 0, text: 'a', presses: [{ id: 1, attemptId: 1, key: 'a', at: 0 }] },
        'a',
      ).pass,
    ).toBe(false);
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

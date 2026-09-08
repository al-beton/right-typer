import { expect, it } from 'vitest';
import {
  allowedFingers,
  EXPECTED,
  ROWS,
  MODES,
  isCorrectFinger,
  intended,
  policyLabel,
  type FingeringMode,
} from '../src/core/keyboard';
import { Exercise, feedback, grade } from '../src/core/exercise';
import { load, save, reset } from '../src/core/storage';
import type { Finger } from '../src/core/types';
const changed: Record<string, Finger> = {
  w: 'left-little',
  e: 'left-ring',
  r: 'left-middle',
  y: 'left-index',
  i: 'right-index',
  o: 'right-middle',
  p: 'right-ring',
  z: 'left-ring',
  x: 'left-middle',
  c: 'left-index',
  b: 'right-index',
  m: 'right-middle',
  ',': 'right-ring',
};
const fingers = ['left', 'right'].flatMap((hand) =>
  ['thumb', 'index', 'middle', 'ring', 'little'].map((digit) => `${hand}-${digit}` as Finger),
);
for (const mode of Object.keys(MODES) as FingeringMode[]) {
  for (const key of [...ROWS.join(''), ' ']) {
    it(`${mode}: complete allowlist, grading and feedback for ${key}`, () => {
      const standard = key === ' ' ? ['left-thumb', 'right-thumb'] : [EXPECTED[key]];
      const alternate = key === ' ' ? standard : [changed[key] ?? EXPECTED[key]];
      const expected =
        mode === 'standard'
          ? standard
          : mode === 'alternate'
            ? alternate
            : [...new Set([...standard, ...alternate])];
      expect(allowedFingers(key, mode)).toEqual(expected);
      for (const finger of fingers) {
        const attempt = {
          id: 1,
          wordIndex: 0,
          text: key,
          mode,
          presses: [
            {
              id: 1,
              attemptId: 1,
              key,
              at: 0,
              observation: {
                kind: 'finger' as const,
                finger,
                frameIds: [1],
                distance: 0,
                offsetMs: 0,
              },
            },
          ],
        };
        const verdict = grade(attempt, key);
        expect(verdict.pass).toBe(expected.includes(finger));
        expect(isCorrectFinger(key, finger, mode)).toBe(verdict.pass);
        if (!verdict.pass)
          expect(feedback(verdict, key, mode)).toContain(`Use ${intended(key, mode)}.`);
      }
    });
  }
}
for (const state of ['typing', 'checking', 'retry', 'paused'] as const) {
  it(`switching during ${state} invalidates old observations without advancing or losing history`, () => {
    const e = new Exercise(['a', 'z']);
    for (const key of 'a ') {
      const p = e.press(key, 10)!;
      e.observe(p.id, p.attemptId, { kind: 'uncertain', reason: 'fixture' });
    }
    e.settle();
    const old = e.press('z', 20)!;
    if (state === 'checking' || state === 'retry') e.press(' ', 30);
    if (state === 'retry') {
      for (const p of e.attempt.presses)
        e.observe(p.id, p.attemptId, {
          kind: 'finger',
          finger: 'right-little',
          frameIds: [1],
          distance: 0,
          offsetMs: 0,
        });
      e.settle();
    }
    if (state === 'paused') e.pause();
    const history = structuredClone(e.history);
    e.changeMode('alternate');
    expect(e.index).toBe(1);
    expect(e.history).toEqual(history);
    expect(e.attempt).toMatchObject({ text: '', presses: [], mode: 'alternate' });
    expect(e.state).toBe(state === 'paused' ? 'paused' : 'typing');
    expect(e.observe(old.id, old.attemptId, { kind: 'uncertain', reason: 'late' })).toBe(false);
    expect(e.settle()).toBeNull();
    if (state === 'paused') e.retry();
    for (const key of 'z ') {
      const p = e.press(key, 40)!;
      e.observe(p.id, p.attemptId, { kind: 'uncertain', reason: 'fixture' });
    }
    e.settle();
    expect(e.policies()).toEqual(['standard', 'alternate']);
    e.changeMode('either');
    expect(e.state).toBe('complete');
    expect(policyLabel(e.policies())).toBe('Mixed: Standard + Alternate diagonal');
  });
}
it('persists modes, defaults malformed values, resets and migrates old results', () => {
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (_: string, v: string) => {
      raw = v;
    },
    removeItem: () => {
      raw = null;
    },
  };
  for (const mode of Object.keys(MODES) as FingeringMode[]) {
    save({ results: [], fingeringMode: mode }, storage);
    expect(load(storage).fingeringMode).toBe(mode);
  }
  for (const bad of [undefined, null, {}, 'bogus', 'toString', 1]) {
    raw = JSON.stringify({ fingeringMode: bad });
    expect(load(storage).fingeringMode).toBe('standard');
  }
  reset(storage);
  expect(load(storage).fingeringMode).toBe('standard');
  const result = {
    ...new Exercise(['a']).stats(0),
    date: '2026-09-08',
    gradingPolicy: 'wrong-finger-veto' as const,
  };
  raw = JSON.stringify({ results: [result] });
  expect(load(storage).results[0]?.fingeringModes).toEqual(['standard']);
  save(
    {
      results: [{ ...result, fingeringModes: ['standard', 'either'] }],
      fingeringMode: 'alternate',
    },
    storage,
  );
  expect(load(storage).results[0]?.fingeringModes).toEqual(['standard', 'either']);
});

for (const from of Object.keys(MODES) as FingeringMode[]) {
  for (const to of Object.keys(MODES) as FingeringMode[]) {
    it(`${from} → ${to} preserves same-policy attempts or starts a fresh attempt`, () => {
      const exercise = new Exercise(['z'], from);
      const press = exercise.press('z', 10)!;
      exercise.changeMode(to);
      expect(exercise.index).toBe(0);
      expect(exercise.attempt.mode).toBe(to);
      expect(exercise.attempt.text).toBe(from === to ? 'z' : '');
      expect(
        exercise.observe(press.id, press.attemptId, { kind: 'uncertain', reason: 'late' }),
      ).toBe(from === to);
    });
  }
}

import { describe, it, expect } from 'vitest';
import { grade, feedback, retryCorrections, type Attempt } from '../src/core/exercise';
import type { Finger, Press } from '../src/core/types';

function press(id: number, key: string, finger: Finger, allowedFingers?: Finger[]): Press {
  return {
    id,
    attemptId: 1,
    key,
    at: id,
    allowedFingers,
    observation: { kind: 'finger', finger, frameIds: [id], distance: 0, offsetMs: 0 },
  };
}
function result(presses: Press[]) {
  const attempt: Attempt = { id: 1, wordIndex: 0, text: 'era', presses };
  return grade(attempt, 'era');
}
describe('retry summary uses rejected presses and their captured policies', () => {
  it('keeps different detections for repeated R presses and groups identical corrections', () => {
    const verdict = result([
      press(1, 'r', 'left-middle'),
      press(2, 'r', 'left-ring'),
      press(3, 'r', 'left-middle'),
    ]);
    expect(retryCorrections(verdict)).toEqual([
      { key: 'R', detected: 'left middle', use: 'left index' },
      { key: 'R', detected: 'left ring', use: 'left index' },
    ]);
    expect(verdict.wrong).toHaveLength(3);
  });
  it('respects a custom Space policy, and labels punctuation and either-thumb separately', () => {
    expect(
      retryCorrections(
        result([
          press(1, ' ', 'right-index', ['left-thumb']),
          press(2, ' ', 'right-index', ['left-thumb', 'right-thumb']),
          press(3, ',', 'left-middle', ['right-ring']),
          press(4, '.', 'left-middle', ['right-index', 'right-ring']),
        ]),
      ),
    ).toEqual([
      { key: 'Space', detected: 'right index', use: 'left thumb' },
      { key: 'Space', detected: 'right index', use: 'either thumb' },
      { key: 'Comma', detected: 'left middle', use: 'right ring' },
      { key: 'Full stop', detected: 'left middle', use: 'right index or right ring' },
    ]);
  });
  it('announces actual R, detection and correction, without unknowns becoming errors', () => {
    const verdict = result([
      press(1, 'r', 'left-middle'),
      { id: 2, attemptId: 1, key: 'a', at: 2 },
    ]);
    expect(feedback(verdict, 'era')).toBe(
      'R: Wrong finger. Detected: left middle. Use left index.',
    );
    expect(retryCorrections(verdict)).toHaveLength(1);
    expect(verdict.uncertain).toHaveLength(1);
  });
});

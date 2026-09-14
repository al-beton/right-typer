import { expect, it } from 'vitest';
import { clipFrameForKey } from '../src/recording/delay-clip';

it('aligns a press to demonstrably different frame identities at zero and 50 ms', () => {
  // Independent visual oracle: 41 red/no-contact, 43 green/contact; 42 was dropped.
  const frames = [
    { id: 41, basisAt: 1000 },
    { id: 43, basisAt: 1050 },
    { id: 44, basisAt: 1091 },
  ];
  expect(frames[clipFrameForKey(frames, 1000, 0)]!.id).toBe(41);
  expect(frames[clipFrameForKey(frames, 1000, 50)]!.id).toBe(43);
  expect(frames[clipFrameForKey(frames, 1040, 50)]!.id).toBe(44);
  expect(clipFrameForKey(frames, 2000, 50)).toBe(-1);
  expect(clipFrameForKey([], 1000, 0)).toBe(-1);
});
it('uses source time rather than sequence/encoding order and does not invent missing frames', () => {
  const frames = [{ basisAt: 1120 }, { basisAt: 1000 }, { basisAt: 1067 }];
  expect(clipFrameForKey(frames, 1000, 50)).toBe(2);
  expect(clipFrameForKey(frames, 1000, 0)).toBe(1);
});

it('scrubbing a sparse clip chooses a real nearby frame even outside grading eligibility', () => {
  const frames = [{ basisAt: 0 }, { basisAt: 3000 }];
  expect(clipFrameForKey(frames, 1900, 0)).toBe(-1);
  expect(clipFrameForKey(frames, 1900, 0, Infinity)).toBe(1);
});

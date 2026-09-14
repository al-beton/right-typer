import { expect, it } from 'vitest';
import { estimateFinger, type TrialContext } from '../src/experiments/timing-trial';
import { calibration, frame } from './fixtures';

const context: TrialContext = {
  calibration: calibration(),
  key: 'f',
  code: 'f',
  intended: ['left-index'],
};
it('tests an assumed delay without changing source clocks or replacing observations with the intended finger', () => {
  const frames = [frame(1, 1000, 'f', 'left-middle'), frame(2, 1200, 'f', 'left-index')].map(
    (f) => ({ ...f, clock: 'unavailable' as const }),
  );
  expect(estimateFinger(context, frames, 1000, 0)).toMatchObject({
    finger: 'left-middle',
    frameId: 1,
    sourceClock: 'unavailable',
    estimatedEventTimeMs: 1000,
    residualMs: 0,
  });
  expect(estimateFinger(context, frames, 1000, 200)).toMatchObject({
    finger: 'left-index',
    frameId: 2,
    sourceClock: 'unavailable',
    callbackTimeMs: 1200,
    estimatedEventTimeMs: 1000,
  });
  expect(frames.map((f) => [f.at, f.clock])).toEqual([
    [1000, 'unavailable'],
    [1200, 'unavailable'],
  ]);
});
it('does not use missing hands or frames outside the bounded estimate window', () => {
  expect(estimateFinger(context, [frame(1, 1500, 'f', 'left-index')], 1000, 0)).toBeNull();
  expect(
    estimateFinger(context, [{ ...frame(1, 1000, 'f', 'left-index'), hands: [] }], 1000, 0),
  ).toBeNull();
});

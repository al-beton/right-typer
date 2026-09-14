import { Exercise } from '../src/core/exercise';
import { expect, it } from 'vitest';
import { attribute, EvidenceBuffer, inspectAttribution } from '../src/core/observation';
import { sourcePoint } from '../src/view/crop';
import { calibration, frame } from './fixtures';

it.each(['a', 's'])(
  'leaves an exact ring/little tie unknown on %s, but preserves a nearer finger',
  (key) => {
    const f = frame(1, 100, key, 'left-little');
    f.hands[0]!.points[16] = { ...f.hands[0]!.points[20]! };
    const decision = inspectAttribution({ key, at: 100 }, [f], calibration());
    expect(decision.observation.kind).toBe('uncertain');
    expect(decision.candidates.slice(0, 2).map((c) => c.finger)).toEqual([
      'left-ring',
      'left-little',
    ]);
    expect(decision.candidates[0]!.distance).toBe(decision.candidates[1]!.distance);
    f.hands[0]!.points[20]!.x += 0.0001;
    expect(attribute({ key, at: 100 }, [f], calibration())).toMatchObject({
      kind: 'finger',
      finger: 'left-ring',
    });
  },
);

it.each(['left-little', 'left-ring'] as const)(
  'preserves clear %s across adjacent keys and crop coordinates',
  (finger) => {
    const crop = { x: 0.05, y: 0.25, width: 0.9, height: 0.7 };
    for (const key of ['a', 's']) {
      const f = frame(1, 100, key, finger);
      const cropped = structuredClone(f);
      cropped.hands.forEach((h) => {
        h.points = h.points.map((p) =>
          sourcePoint({ x: (p.x - crop.x) / crop.width, y: (p.y - crop.y) / crop.height }, crop),
        );
      });
      for (const candidate of [f, cropped])
        expect(attribute({ key, at: 100 }, [candidate], calibration())).toMatchObject({
          kind: 'finger',
          finger,
        });
    }
  },
);

it('inspects the settled frame once, excludes images/hands, and cannot alter the grading', async () => {
  const evidence = new EvidenceBuffer();
  const decisions: ReturnType<typeof inspectAttribution>[] = [];
  evidence.inspectDecision = (_p, _c, d) => {
    decisions.push(structuredClone(d));
    d.observation = { kind: 'uncertain', reason: 'observer mutation' };
  };
  const f = frame(7, 99, 'a', 'left-ring');
  f.clock = 'estimated';
  f.timing = {
    source: 'desk-view',
    basis: 'callback',
    nativeCaptureTime: null,
    callbackAt: 99,
    mediaTime: 1,
    presentedFrames: 7,
    offsetMs: 0,
    uncertaintyMs: null,
  };
  evidence.add(f);
  evidence.add(frame(8, 140, 'a', 'left-little'));
  const result = evidence.request({ id: 1, attemptId: 1, key: 'a', at: 100 }, calibration());
  evidence.tick(150);
  expect(await result).toMatchObject({ kind: 'finger', finger: 'left-ring', frameIds: [7] });
  expect(decisions[0]!.frame).toEqual({
    id: 7,
    at: 99,
    receivedAt: 119,
    clock: 'estimated',
    timing: f.timing,
  });
  expect(decisions[0]!.candidates[0]).toMatchObject({
    finger: 'left-ring',
    landmarkIndex: 16,
    point: calibration().points.a,
  });
  evidence.add(frame(9, 100, 'a', 'left-little'));
  evidence.tick(1200);
  expect(decisions).toHaveLength(1);
  let cleared = 0;
  evidence.clearInspection = (preserve) => {
    if (!preserve) cleared++;
  };
  evidence.reset({ preserveInspection: true });
  expect(cleared).toBe(0);
  const cancelled = evidence.request({ id: 2, attemptId: 1, key: 'a', at: 200 }, calibration());
  evidence.reset();
  expect((await cancelled).kind).toBe('uncertain');
  expect(cleared).toBe(1);
  expect(decisions).toHaveLength(1);
});

it('lets a correctly typed word pass with an unknown tie while a genuine ring A still retries', () => {
  for (const tied of [true, false]) {
    const exercise = new Exercise(['a']);
    const f = frame(1, 100, 'a', 'left-ring');
    if (tied) f.hands[0]!.points[20] = { ...f.hands[0]!.points[16]! };
    const a = exercise.press('a', 100)!;
    exercise.observe(a.id, a.attemptId, attribute(a, [f], calibration()));
    const space = exercise.press(' ', 200)!;
    exercise.observe(
      space.id,
      space.attemptId,
      attribute(space, [frame(2, 200, ' ', 'right-thumb')], calibration()),
    );
    expect(exercise.settle()?.pass).toBe(tied);
    expect(exercise.stats(300).uncertainPresses).toBe(tied ? 1 : 0);
  }
});

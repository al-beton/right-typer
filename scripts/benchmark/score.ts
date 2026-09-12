import type { Finger, Observation, Frame } from '../../src/core/types';
import type { Sample } from '../../src/recording/types';
import { replaySample } from '../../src/recording/replay';
// Fresh inference is the sole source of hands, including when captured pixels
// are missing for a recorded result. Never retain old model output as a fallback.
export function replaceLandmarks(sample: Sample, frames: Pick<Frame, 'id' | 'hands'>[]) {
  const fresh = new Map(frames.map((frame) => [frame.id, frame.hands]));
  if (fresh.size !== frames.length) throw new Error('Duplicate inference frame IDs');
  let missing = 0;
  for (const row of sample.events) {
    if (row.type !== 'evidence' || row.event.type !== 'frame-result') continue;
    row.event.frame.hands = fresh.get(row.event.frame.id) ?? [];
    if (!fresh.has(row.event.frame.id)) missing++;
  }
  return missing;
}
export async function scoreSample(sample: Sample) {
  const observed = new Map<string, Observation>();
  const requests = new Map<string, { key: string; at: number; code?: string }>();
  for (const row of sample.events) {
    if (row.type === 'evidence' && row.event.type === 'request') {
      const press = row.event.press;
      requests.set(`${press.attemptId}/${press.id}`, press);
    }
  }
  const replay = await replaySample(sample, (press, observation) => {
    observed.set(`${press.attemptId}/${press.id}`, observation);
  });
  const presses = sample.labels
    .filter((l) => l.status === 'confirmed')
    .map((label) => {
      const observation = observed.get(`${label.attemptId}/${label.pressId}`);
      const predicted: Finger | null = observation?.kind === 'finger' ? observation.finger : null;
      return {
        attemptId: label.attemptId,
        pressId: label.pressId,
        key: requests.get(`${label.attemptId}/${label.pressId}`)?.key,
        code: requests.get(`${label.attemptId}/${label.pressId}`)?.code,
        atMs: requests.get(`${label.attemptId}/${label.pressId}`)?.at,
        humanFinger: label.finger,
        predicted,
        matches: predicted === label.finger,
        frameIds: observation?.kind === 'finger' ? observation.frameIds : [],
      };
    });
  const matches = presses.filter((p) => p.matches).length;
  return {
    labelled: presses.length,
    matches,
    accuracy: presses.length ? matches / presses.length : null,
    unclassified: presses.filter((p) => p.predicted === null).length,
    presses,
    grading: replay.groundTruth,
    changedRecordedDecisions: replay.differences.length,
  };
}

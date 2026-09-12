import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attribute } from '../src/core/observation';
import { validCalibration } from '../src/core/calibration';
import type { Calibration, Finger, Frame, Press } from '../src/core/types';

type ReferenceCase = {
  id: string;
  recording: string;
  press: Pick<Press, 'key' | 'code' | 'at'>;
  frameIds: number[];
  finger: Finger;
  allowedFingers: Finger[];
};
type KnownDisagreement = { recordedPrediction: Finger | null; humanFinger: Finger };
const directory = new URL('./fixtures/recorded/pilot-human-v2/', import.meta.url);
const json = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, directory), 'utf8'));
const manifest = json<{ cases: number; snapshot: string }>('manifest.json');
const recordings = json<{ id: string; calibration: Calibration }[]>('recordings.json');
const cases = json<ReferenceCase[]>('cases.json');
const known = json<Record<string, KnownDisagreement>>('known-disagreements.json');
const frames = readFileSync(new URL('frames.jsonl', directory), 'utf8')
  .trim()
  .split('\n')
  .map((line): { recording: string; frame: Frame } => JSON.parse(line));
const calibrations = new Map(recordings.map((r) => [r.id, r.calibration]));
const byFrame = new Map(frames.map((f) => [`${f.recording}/${f.frame.id}`, f.frame]));
const observations = cases.map((entry) => {
  const inputs = entry.frameIds.map((id) => byFrame.get(`${entry.recording}/${id}`)!);
  const calibration = calibrations.get(entry.recording)!;
  const observation = attribute(entry.press, inputs, calibration);
  const predicted = observation.kind === 'finger' ? observation.finger : null;
  return { entry, inputs, calibration, predicted };
});
const mismatches = observations.filter((r) => r.predicted !== r.entry.finger);
const regressions = mismatches.filter(
  (r) => !known[r.entry.id] || r.predicted !== known[r.entry.id]!.recordedPrediction,
);
const correct = observations.filter((r) => r.entry.allowedFingers.includes(r.entry.finger));
const wrong = observations.filter((r) => !r.entry.allowedFingers.includes(r.entry.finger));
const rejected = (r: (typeof observations)[number]) =>
  r.predicted !== null && !r.entry.allowedFingers.includes(r.predicted);
console.info(
  `Recorded reference ${manifest.snapshot}: ${cases.length - mismatches.length}/${cases.length} match human labels; ` +
    `${mismatches.length} disagreements, ${regressions.length} new regressions. ` +
    `Correct presses rejected: ${correct.filter(rejected).length}/${correct.length}; ` +
    `wrong-finger presses caught: ${wrong.filter(rejected).length}/${wrong.length}. ` +
    'Cached landmarks from one participant; no vision-model rerun.',
);

describe('human-labelled recorded camera reference', () => {
  it('covers every labelled press exactly once with valid calibration and frame references', () => {
    expect(cases).toHaveLength(manifest.cases);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(byFrame.size).toBe(frames.length);
    expect(recordings.every((r) => validCalibration(r.calibration))).toBe(true);
    for (const row of observations) {
      expect(row.inputs.every(Boolean)).toBe(true);
      expect(row.calibration).toBeDefined();
    }
    for (const [id, issue] of Object.entries(known)) {
      expect(cases.find((c) => c.id === id)?.finger).toBe(issue.humanFinger);
      expect(issue.recordedPrediction).not.toBe(issue.humanFinger);
    }
  });

  for (const { entry, predicted } of observations) {
    const issue = known[entry.id];
    it(`${entry.id}: ${entry.press.code ?? entry.press.key} → ${entry.finger}${issue ? ' (documented disagreement)' : ''}`, () => {
      // Ground truth never changes to match the algorithm. Normal CI tolerates
      // only the exact documented old error; a fix passes, any new error fails.
      if (process.env.REFERENCE_STRICT === '1' || !issue || predicted === entry.finger) {
        expect(predicted).toBe(entry.finger);
      } else {
        expect(predicted).toBe(issue.recordedPrediction);
      }
    });
  }

  it('does not attribute a labelled press when its recorded timing is moved outside the evidence', () => {
    const first = observations[0]!;
    expect(attribute({ ...first.entry.press, at: 1e9 }, first.inputs, first.calibration).kind).toBe(
      'uncertain',
    );
  });
});

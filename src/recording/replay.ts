import { EvidenceBuffer } from '../core/observation';
import { grade } from '../core/exercise';
import { allowedFingers } from '../core/keyboard';
import type { Observation } from '../core/types';
import type { Sample } from './types';
import { validateSample } from './validate';
export async function replaySample(sample: Sample) {
  validateSample(sample);
  const buffer = new EvidenceBuffer();
  const observed = new Map<string, Observation>();
  const differences: { seq: number; reason: string }[] = [];
  let settled = 0,
    words = 0;
  for (const row of sample.events) {
    if (row.type === 'evidence') {
      const event = row.event;
      if (event.type === 'frame-start') buffer.startFrame(event.id, event.at);
      if (event.type === 'frame-result') buffer.add(event.frame);
      if (event.type === 'reset') buffer.reset();
      if (event.type === 'tick') buffer.tick(event.at);
      if (event.type === 'request') {
        void buffer
          .request(structuredClone(event.press), sample.calibration)
          .then((o) => observed.set(`${event.press.attemptId}/${event.press.id}`, o));
      }
      // Preserve microtask delivery before subsequent recorded callbacks.
      await Promise.resolve();
    }
    if (row.type === 'observation') {
      settled++;
      if (
        JSON.stringify(observed.get(`${row.attemptId}/${row.pressId}`)) !==
        JSON.stringify(row.observation)
      )
        differences.push({ seq: row.seq, reason: `Attribution changed for press ${row.pressId}` });
    }
    if (row.type === 'verdict') {
      words++;
      const attempt = structuredClone(row.attempt);
      for (const press of attempt.presses)
        press.observation = observed.get(`${press.attemptId}/${press.id}`);
      const result = grade(attempt, row.word);
      if (JSON.stringify(result) !== JSON.stringify(row.verdict))
        differences.push({ seq: row.seq, reason: `Grading changed for attempt ${attempt.id}` });
    }
  }
  let confirmed = 0,
    correctPresses = 0,
    correctPressesRejected = 0,
    wrongPresses = 0,
    wrongPressesMissed = 0,
    unresolved = 0;
  for (const label of sample.labels.filter((l) => l.status === 'confirmed')) {
    const request = sample.events.find(
      (e) =>
        e.type === 'evidence' &&
        e.event.type === 'request' &&
        e.event.press.id === label.pressId &&
        e.event.press.attemptId === label.attemptId,
    );
    if (!request || request.type !== 'evidence' || request.event.type !== 'request') continue;
    const press = request.event.press;
    const fingers = press.allowedFingers ?? allowedFingers(press.key, sample.manifest.mode);
    const observation = observed.get(`${label.attemptId}/${label.pressId}`);
    confirmed++;
    if (!observation) {
      unresolved++;
      continue;
    }
    const rejected = observation.kind === 'finger' && !fingers.includes(observation.finger);
    if (fingers.includes(label.finger!)) {
      correctPresses++;
      if (rejected) correctPressesRejected++;
    } else {
      wrongPresses++;
      if (!rejected) wrongPressesMissed++;
    }
  }
  return {
    sessionId: sample.manifest.sessionId,
    mode: sample.manifest.mode,
    inputs: sample.frames.length,
    resultFramesWithoutPixels: sample.events.filter(
      (e) =>
        e.type === 'evidence' &&
        e.event.type === 'frame-result' &&
        !sample.frames.some((f) => e.event.type === 'frame-result' && f.id === e.event.frame.id),
    ).length,
    unfinishedPresses: sample.labels.filter((l) => !observed.has(`${l.attemptId}/${l.pressId}`))
      .length,
    copyOverheadMs: {
      mean: sample.frames.reduce((sum, f) => sum + f.copyMs, 0) / sample.frames.length,
      max: Math.max(...sample.frames.map((f) => f.copyMs)),
    },
    settledPresses: settled,
    submittedWords: words,
    differences,
    groundTruth: {
      confirmed,
      unresolved,
      correctPresses,
      correctPressesRejected,
      wrongPresses,
      wrongPressesMissed,
    },
    note: 'Matching recorded decisions verifies replay, not finger accuracy. Ground-truth metrics require independent confirmed labels. Unsettled final presses are excluded.',
  };
}

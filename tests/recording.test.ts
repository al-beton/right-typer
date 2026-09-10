import { describe, it, expect } from 'vitest';
import { archive, unarchive } from '../src/recording/archive';
import { validateSample } from '../src/recording/validate';
import { replaySample } from '../src/recording/replay';
import { attribute } from '../src/core/observation';
import { grade } from '../src/core/exercise';
import { allowedFingers } from '../src/core/keyboard';
import { calibration, frame } from './fixtures';
import type { Sample } from '../src/recording/types';

function fixture(): Sample {
  const c = { ...calibration(), deviceId: 'sample-camera' };
  const f = frame(1, 11, 'f', 'left-index', 20);
  const p = { id: 1, attemptId: 1, key: 'f', at: 10 };
  const o = attribute(p, [f], c);
  const attempt = {
    id: 1,
    wordIndex: 0,
    text: 'f',
    mode: 'standard' as const,
    presses: [{ ...p, observation: o }],
  };
  return {
    manifest: {
      schemaVersion: 1,
      sessionId: 'synthetic',
      participantId: 'p01',
      setupId: 's01',
      createdAt: '2026-09-08T00:00:00Z',
      durationMs: 100,
      stopReason: 'test',
      app: {
        commit: 'synthetic',
        dirty: false,
        modelSha256: 'test',
        trackingWorkerSha256: 'test',
        mediapipe: 'test',
      },
      mode: 'standard',
      expectedFingers: { f: allowedFingers('f') },
      words: ['f'],
      camera: {
        width: c.width,
        height: c.height,
        rotation: 0,
        mirrored: false,
        coordinates: 'native-normalized',
        videoMimeType: 'video/webm',
      },
      browser: 'synthetic',
      setupNotes: '',
      timing: {
        unit: 'milliseconds',
        origin: 'session-start',
        video: 'viewing-only; use timestamped PNG inputs for alignment',
        unobservedCameraDrops: null,
      },
      files: {
        'inputs/1.png': { bytes: 1, sha256: 'synthetic' },
        'camera.webm': { bytes: 1, sha256: 'synthetic' },
      },
      warnings: [],
    },
    calibration: c,
    frames: [
      {
        id: 1,
        at: 11,
        clock: 'capture',
        mediaTime: 1,
        presentedFrames: 1,
        dispatchedAt: 12,
        file: 'inputs/1.png',
        copyMs: 0,
      },
    ],
    events: [
      { seq: 1, at: 10, type: 'evidence', event: { type: 'request', press: p } },
      { seq: 2, at: 12, type: 'evidence', event: { type: 'frame-start', id: 1, at: 11 } },
      { seq: 3, at: 20, type: 'evidence', event: { type: 'frame-result', frame: f } },
      { seq: 4, at: 25, type: 'evidence', event: { type: 'tick', at: 25 } },
      {
        seq: 5,
        at: 25,
        type: 'observation',
        pressId: 1,
        attemptId: 1,
        observation: o,
        accepted: true,
      },
      { seq: 6, at: 26, type: 'verdict', attempt, word: 'f', verdict: grade(attempt, 'f') },
    ],
    labels: [{ pressId: 1, attemptId: 1, status: 'unreviewed', finger: null, source: '' }],
  };
}
describe('sample contract and replay', () => {
  it('replays the production buffer and grade identically without inventing ground truth', async () => {
    const sample = fixture();
    const first = await replaySample(sample);
    expect(first.differences).toEqual([]);
    expect(first.submittedWords).toBe(1);
    expect(first.groundTruth.confirmed).toBe(0);
    expect(await replaySample(sample)).toEqual(first);
  });
  it('detects changed camera evidence and counts independently labelled false rejections', async () => {
    const sample = fixture();
    sample.labels[0] = {
      pressId: 1,
      attemptId: 1,
      status: 'confirmed',
      finger: 'left-index',
      source: 'Human review of frame 1',
    };
    const row = sample.events[2]!;
    if (row.type === 'evidence' && row.event.type === 'frame-result')
      row.event.frame = frame(1, 11, 'f', 'left-middle', 20);
    const report = await replaySample(sample);
    expect(report.differences.length).toBe(2);
    expect(report.groundTruth.correctPressesRejected).toBe(1);
  });
  it('detects a timing perturbation which withholds the result past settlement', async () => {
    const sample = fixture();
    const row = sample.events[2]!;
    if (row.type === 'evidence' && row.event.type === 'frame-result') row.event.frame.at = -600;
    const report = await replaySample(sample);
    expect(report.differences.length).toBeGreaterThan(0);
  });
  it('rejects missing pixels, bad geometry, duplicate event sequence and unconfirmed labels', () => {
    let sample = fixture();
    delete sample.manifest.files['inputs/1.png'];
    expect(() => validateSample(sample)).toThrow('Missing input pixels');
    sample = fixture();
    sample.manifest.camera.width = 1;
    expect(() => validateSample(sample)).toThrow('geometry');
    sample = fixture();
    sample.events[1]!.seq = 1;
    expect(() => validateSample(sample)).toThrow('sequence');
    sample = fixture();
    sample.labels[0]!.finger = 'left-index';
    expect(() => validateSample(sample)).toThrow('Confirmed labels');
  });
  it('round trips multiple binary files through a portable archive and rejects corruption', async () => {
    const bytes = new Uint8Array(
      await (
        await archive({
          'manifest.json': new Blob(['{}']),
          'inputs/1.png': new Blob([new Uint8Array([0, 255, 3])]),
        })
      ).arrayBuffer(),
    );
    const files = unarchive(Buffer.from(bytes));
    expect([...files['inputs/1.png']!]).toEqual([0, 255, 3]);
    expect(files['inputs/1.png']!.buffer.byteLength).toBe(3);
    bytes[0] = 0;
    expect(() => unarchive(bytes)).toThrow('Corrupt');
    await expect(archive({ '../escape': new Blob(['no']) })).rejects.toThrow('Invalid');
  });
});

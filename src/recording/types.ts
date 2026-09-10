import type { Attempt, Verdict } from '../core/exercise';
import type { EvidenceEvent } from '../core/observation';
import type { Calibration, Finger, Observation } from '../core/types';
import type { FingeringMode } from '../core/keyboard';

export type SampleEvent = { seq: number; at: number } & (
  | { type: 'evidence'; event: EvidenceEvent }
  | {
      type: 'observation';
      pressId: number;
      attemptId: number;
      observation: Observation;
      accepted: boolean;
    }
  | { type: 'verdict'; attempt: Attempt; word: string; verdict: Verdict }
  | {
      type: 'key';
      action: 'keydown' | 'keyup';
      shiftKey?: boolean;
      altGraph?: boolean;
      key: string;
      code: string;
      repeat: boolean;
      eventAt: number;
      attemptId: number;
      state: string;
    }
  | { type: 'lifecycle'; name: string; detail?: string }
);
export type InputFrame = {
  id: number;
  at: number;
  clock: 'capture' | 'unavailable';
  mediaTime: number;
  presentedFrames: number;
  dispatchedAt: number;
  file: string;
  copyMs: number;
  encodedAt?: number;
  error?: string;
};
export type Label = {
  pressId: number;
  attemptId: number;
  status: 'unreviewed' | 'confirmed' | 'unlabelable';
  finger: Finger | null;
  source: string;
};
export type Manifest = {
  schemaVersion: 1 | 2;
  sessionId: string;
  participantId: string;
  setupId: string;
  createdAt: string;
  durationMs: number;
  stopReason: string;
  app: {
    commit: string;
    dirty: boolean;
    modelSha256: string;
    trackingWorkerSha256: string;
    mediapipe: string;
  };
  mode: FingeringMode;
  expectedFingers: Record<string, Finger[]>;
  words: string[];
  camera: {
    width: number;
    height: number;
    frameRate?: number;
    rotation: number;
    mirrored: false;
    coordinates: 'native-normalized';
    videoMimeType: string;
  };
  browser: string;
  setupNotes: string;
  timing: {
    unit: 'milliseconds';
    origin: 'session-start';
    video: 'viewing-only; use timestamped PNG inputs for alignment';
    unobservedCameraDrops: null;
  };
  files: Record<string, { bytes: number; sha256: string }>;
  warnings: string[];
};
export type Sample = {
  manifest: Manifest;
  calibration: Calibration;
  events: SampleEvent[];
  frames: InputFrame[];
  labels: Label[];
};

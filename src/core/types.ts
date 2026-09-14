export type Hand = 'left' | 'right';
export type Digit = 'thumb' | 'index' | 'middle' | 'ring' | 'little';
export type Finger = `${Hand}-${Digit}`;
export type Point = { x: number; y: number; z?: number };
export type SeenHand = { side: Hand; score: number; points: Point[] };
export type FrameTiming = {
  source: 'camera' | 'desk-view' | 'window';
  basis: 'browser-capture' | 'callback';
  nativeCaptureTime: number | null;
  callbackAt: number;
  mediaTime: number;
  presentedFrames: number;
  offsetMs: number;
  // null means no measured exposure-error bound is available. Never infer one
  // from model turnaround or the width of the attribution search window.
  uncertaintyMs: number | null;
};
export type Frame = {
  id: number;
  at: number;
  receivedAt: number;
  clock: 'capture' | 'estimated' | 'unavailable';
  timing?: FrameTiming;
  hands: SeenHand[];
};
export type Calibration = {
  version: 1;
  profile?: import('./profile').KeyboardProfile;
  points: Record<string, Point>;
  deviceId: string;
  width: number;
  height: number;
  swapHands: boolean;
  savedAt: number;
};
export type Observation =
  | {
      kind: 'finger';
      finger: Finger;
      frameIds: number[];
      distance: number;
      offsetMs: number;
      timing?: FrameTiming;
    }
  | { kind: 'uncertain'; reason: string };
export type Press = {
  id: number;
  attemptId: number;
  key: string;
  code?: string;
  allowedFingers?: Finger[];
  at: number;
  observation?: Observation;
};

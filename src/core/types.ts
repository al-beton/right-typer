export type Hand = 'left' | 'right';
export type Digit = 'thumb' | 'index' | 'middle' | 'ring' | 'little';
export type Finger = `${Hand}-${Digit}`;
export type Point = { x: number; y: number; z?: number };
export type SeenHand = { side: Hand; score: number; points: Point[] };
export type Frame = {
  id: number;
  at: number;
  receivedAt: number;
  clock: 'capture' | 'unavailable';
  hands: SeenHand[];
};
export type Calibration = {
  version: 1;
  points: Record<string, Point>;
  deviceId: string;
  width: number;
  height: number;
  swapHands: boolean;
  savedAt: number;
};
export type Observation =
  | { kind: 'finger'; finger: Finger; frameIds: number[]; distance: number }
  | { kind: 'uncertain'; reason: string };
export type Press = {
  id: number;
  attemptId: number;
  key: string;
  at: number;
  observation?: Observation;
};

import type { FingerName } from '../typing/fingerMap'

export interface Point3D {
  x: number
  y: number
  z: number
}

export interface TrackedHand {
  hand: 'left' | 'right'
  confidence: number
  fingertips: Record<FingerName, Point3D>
}

export interface LandmarkFrame {
  timestamp: number
  inferenceMs: number
  hands: TrackedHand[]
}

export type TrackingWorkerMessage =
  | { type: 'ready' }
  | { type: 'frame'; frame: LandmarkFrame }
  | { type: 'error'; message: string }


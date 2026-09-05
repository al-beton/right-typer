import {
  FINGER_TARGETS,
  type FingerName,
  type FingerTarget,
  type HandSide,
  isExpectedFinger,
} from '../typing/fingerMap'
import type { LandmarkFrame, Point3D, TrackedHand } from '../tracking/types'

export const CALIBRATION_VERSION = 1

export interface KeyCentre {
  x: number
  y: number
}

export interface CalibrationSample {
  centre: KeyCentre
  observedHand: 'left' | 'right'
  observedFinger: FingerName
  proximity: number
  motion: number
  confidence: number
}

export interface CalibrationRecord {
  version: typeof CALIBRATION_VERSION
  createdAt: string
  camera: {
    deviceId: string
    width: number
    height: number
  }
  keys: Record<string, CalibrationSample>
}

export interface CalibrationCheck {
  ok: boolean
  reason?: string
  sample?: CalibrationSample
}

export interface FingerCandidate {
  hand: 'left' | 'right'
  finger: FingerName
  proximity: number
  motion: number
  confidence: number
}

const FINGERS: readonly FingerName[] = ['thumb', 'index', 'middle', 'ring', 'little']

function distance(point: Point3D, centre: KeyCentre): number {
  return Math.hypot(point.x - centre.x, point.y - centre.y)
}

function getHand(frame: LandmarkFrame, side: Exclude<HandSide, 'either'>): TrackedHand | undefined {
  return frame.hands.find((hand) => hand.hand === side)
}

function candidateFor(
  frames: LandmarkFrame[],
  centre: KeyCentre,
  hand: 'left' | 'right',
  finger: FingerName,
): FingerCandidate | undefined {
  const points = frames.flatMap((frame) => {
    const trackedHand = getHand(frame, hand)
    return trackedHand ? [{ point: trackedHand.fingertips[finger], confidence: trackedHand.confidence }] : []
  })
  if (points.length < 2) return undefined

  let proximity = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let confidence = 0
  for (const { point, confidence: pointConfidence } of points) {
    proximity = Math.min(proximity, distance(point, centre))
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
    confidence += pointConfidence
  }

  return {
    hand,
    finger,
    proximity,
    motion: maxY - minY,
    confidence: confidence / points.length,
  }
}

export function visibleHandCount(frame: LandmarkFrame | undefined, minimumConfidence = 0.55): number {
  return frame?.hands.filter((hand) => hand.confidence >= minimumConfidence).length ?? 0
}

export function collectCandidates(frames: LandmarkFrame[], centre: KeyCentre): FingerCandidate[] {
  const candidates: FingerCandidate[] = []
  for (const hand of ['left', 'right'] as const) {
    for (const finger of FINGERS) {
      const candidate = candidateFor(frames, centre, hand, finger)
      if (candidate) candidates.push(candidate)
    }
  }
  return candidates
}

export function validateCalibrationSample(
  target: FingerTarget,
  centre: KeyCentre,
  frames: LandmarkFrame[],
  eventTimestamp: number,
): CalibrationCheck {
  const latest = frames.at(-1)
  if (!latest || eventTimestamp - latest.timestamp > 220) {
    return { ok: false, reason: 'Tracking was stale. Hold both hands in view and try that key again.' }
  }
  if (visibleHandCount(latest) < 2) {
    return { ok: false, reason: 'Both hands need to be visible for a reliable sample.' }
  }

  const allowedHands = target.hand === 'either' ? (['left', 'right'] as const) : ([target.hand] as const)
  const expectedCandidates = collectCandidates(frames, centre).filter(
    (candidate) => allowedHands.includes(candidate.hand) && candidate.finger === target.finger,
  )
  const best = expectedCandidates.toSorted((a, b) => a.proximity - b.proximity)[0]
  if (!best || best.confidence < 0.55) {
    return { ok: false, reason: `I could not see the expected ${target.finger} finger clearly.` }
  }
  if (best.proximity > 0.13) {
    return { ok: false, reason: 'That fingertip was too far from the marked key centre. Re-mark and press it.' }
  }
  if (best.motion < 0.0035) {
    return { ok: false, reason: 'The press motion was too subtle to measure. Lift, then press once more.' }
  }

  return {
    ok: true,
    sample: {
      centre,
      observedHand: best.hand,
      observedFinger: best.finger,
      proximity: best.proximity,
      motion: best.motion,
      confidence: best.confidence,
    },
  }
}

export function isCompleteCalibration(keys: Record<string, CalibrationSample>): boolean {
  return FINGER_TARGETS.every((target) => Boolean(keys[target.code]))
}

export function matchesCamera(
  calibration: CalibrationRecord | null,
  camera: CalibrationRecord['camera'],
): calibration is CalibrationRecord {
  return Boolean(
    calibration &&
      calibration.version === CALIBRATION_VERSION &&
      calibration.camera.deviceId === camera.deviceId &&
      isCompleteCalibration(calibration.keys),
  )
}

export function candidateMatchesTarget(candidate: FingerCandidate, target: FingerTarget): boolean {
  return isExpectedFinger(target, candidate)
}


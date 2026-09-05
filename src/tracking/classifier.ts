import type { CalibrationRecord } from '../calibration/calibration'
import { candidateMatchesTarget, collectCandidates } from '../calibration/calibration'
import { TARGET_BY_CODE, type FingerName } from '../typing/fingerMap'
import type { LandmarkFrame } from './types'

export type Classification =
  | { outcome: 'correct'; confidence: number; hand: 'left' | 'right'; finger: FingerName }
  | { outcome: 'wrong'; confidence: number; hand: 'left' | 'right'; finger: FingerName }
  | { outcome: 'uncertain'; confidence: number; reason: string }

export function classifyPress(
  code: string,
  timestamp: number,
  frames: LandmarkFrame[],
  calibration: CalibrationRecord,
): Classification {
  const target = TARGET_BY_CODE.get(code)
  const sample = calibration.keys[code]
  if (!target || !sample) {
    return { outcome: 'uncertain', confidence: 0, reason: 'This key is not calibrated.' }
  }
  const latest = frames.at(-1)
  if (!latest || timestamp - latest.timestamp > 220) {
    return { outcome: 'uncertain', confidence: 0, reason: 'The landmark sample was too old.' }
  }
  if (latest.hands.length < 2) {
    return { outcome: 'uncertain', confidence: 0, reason: 'One hand was outside the camera view.' }
  }

  const maximumDistance = Math.max(0.075, sample.proximity * 2.3)
  const minimumMotion = Math.max(0.0025, sample.motion * 0.2)
  const candidates = collectCandidates(frames, sample.centre)
    .filter((candidate) => candidate.confidence >= 0.5)
    .filter((candidate) => candidate.proximity <= maximumDistance)
    .filter((candidate) => candidate.motion >= minimumMotion)
    .toSorted((a, b) => {
      const aScore = a.proximity - a.motion * 0.35
      const bScore = b.proximity - b.motion * 0.35
      return aScore - bScore
    })

  const best = candidates[0]
  if (!best) {
    return { outcome: 'uncertain', confidence: 0, reason: 'No fingertip movement was clear enough.' }
  }

  const second = candidates[1]
  if (second && Math.abs(second.proximity - best.proximity) < 0.008 && second.motion >= best.motion * 0.8) {
    return { outcome: 'uncertain', confidence: best.confidence, reason: 'Two fingers were equally likely.' }
  }

  const confidence = Math.max(
    0,
    Math.min(1, best.confidence * (1 - best.proximity / maximumDistance) * Math.min(1, best.motion / minimumMotion)),
  )
  return candidateMatchesTarget(best, target)
    ? { outcome: 'correct', confidence, hand: best.hand, finger: best.finger }
    : { outcome: 'wrong', confidence, hand: best.hand, finger: best.finger }
}


import { describe, expect, it } from 'vitest'
import { CALIBRATION_VERSION, type CalibrationRecord } from '../src/calibration/calibration'
import { classifyPress } from '../src/tracking/classifier'
import type { FingerName } from '../src/typing/fingerMap'
import type { LandmarkFrame, TrackedHand } from '../src/tracking/types'

const fingers: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'little']

function hand(
  side: 'left' | 'right',
  moving: { hand: 'left' | 'right'; finger: FingerName; y: number },
): TrackedHand {
  return {
    hand: side,
    confidence: 0.95,
    fingertips: Object.fromEntries(
      fingers.map((finger, index) => [
        finger,
        moving.hand === side && moving.finger === finger
          ? { x: 0.5, y: moving.y, z: 0 }
          : { x: 0.75 + index * 0.025, y: 0.78, z: 0 },
      ]),
    ) as TrackedHand['fingertips'],
  }
}

function frames(movingHand: 'left' | 'right', movingFinger: FingerName, bothHands = true): LandmarkFrame[] {
  return [940, 970, 995].map((timestamp, index) => ({
    timestamp,
    inferenceMs: 18,
    hands: [
      hand('left', { hand: movingHand, finger: movingFinger, y: 0.46 + index * 0.02 }),
      ...(bothHands ? [hand('right', { hand: movingHand, finger: movingFinger, y: 0.46 + index * 0.02 })] : []),
    ],
  }))
}

const calibration: CalibrationRecord = {
  version: CALIBRATION_VERSION,
  createdAt: '2026-09-05T00:00:00.000Z',
  camera: { deviceId: 'camera', width: 1280, height: 720 },
  keys: {
    KeyA: {
      centre: { x: 0.5, y: 0.5 },
      observedHand: 'left',
      observedFinger: 'little',
      proximity: 0.01,
      motion: 0.04,
      confidence: 0.95,
    },
  },
}

describe('temporal classifier', () => {
  it('accepts the expected finger', () => {
    expect(classifyPress('KeyA', 1_000, frames('left', 'little'), calibration)).toMatchObject({
      outcome: 'correct',
      hand: 'left',
      finger: 'little',
    })
  })

  it('identifies a confidently wrong finger', () => {
    expect(classifyPress('KeyA', 1_000, frames('right', 'index'), calibration)).toMatchObject({
      outcome: 'wrong',
      hand: 'right',
      finger: 'index',
    })
  })

  it('returns uncertainty instead of guessing with a hidden hand', () => {
    expect(classifyPress('KeyA', 1_000, frames('left', 'little', false), calibration).outcome).toBe('uncertain')
  })
})


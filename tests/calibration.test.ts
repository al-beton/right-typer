import { describe, expect, it } from 'vitest'
import { validateCalibrationSample } from '../src/calibration/calibration'
import { TARGET_BY_CODE, type FingerName } from '../src/typing/fingerMap'
import type { LandmarkFrame, TrackedHand } from '../src/tracking/types'

const fingers: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'little']

function hand(side: 'left' | 'right', littleY: number): TrackedHand {
  return {
    hand: side,
    confidence: 0.92,
    fingertips: Object.fromEntries(
      fingers.map((finger, index) => [
        finger,
        finger === 'little' && side === 'left'
          ? { x: 0.5, y: littleY, z: 0 }
          : { x: 0.8 + index * 0.01, y: 0.8, z: 0 },
      ]),
    ) as TrackedHand['fingertips'],
  }
}

function frame(timestamp: number, littleY: number, includeRight = true): LandmarkFrame {
  return {
    timestamp,
    inferenceMs: 18,
    hands: includeRight ? [hand('left', littleY), hand('right', 0.8)] : [hand('left', littleY)],
  }
}

describe('calibration quality', () => {
  it('accepts a fresh, close, moving expected fingertip', () => {
    const result = validateCalibrationSample(
      TARGET_BY_CODE.get('KeyA')!,
      { x: 0.5, y: 0.5 },
      [frame(900, 0.46), frame(960, 0.49), frame(995, 0.5)],
      1_000,
    )
    expect(result.ok).toBe(true)
    expect(result.sample).toMatchObject({ observedHand: 'left', observedFinger: 'little' })
  })

  it('rejects a sample when one hand is hidden', () => {
    const result = validateCalibrationSample(
      TARGET_BY_CODE.get('KeyA')!,
      { x: 0.5, y: 0.5 },
      [frame(960, 0.46, false), frame(995, 0.5, false)],
      1_000,
    )
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('Both hands')
  })
})


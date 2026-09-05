import { describe, expect, it } from 'vitest'
import { EMPTY_STATISTICS, accuracy, applyGrade, wordsPerMinute } from '../src/typing/statistics'

describe('lesson statistics', () => {
  it('uses accepted characters divided by five over elapsed minutes', () => {
    expect(wordsPerMinute({ ...EMPTY_STATISTICS, startedAt: 0, endedAt: 60_000, acceptedCharacters: 250 })).toBe(50)
  })

  it('excludes uncertain retries from mistakes and accuracy', () => {
    const uncertain = applyGrade(
      { ...EMPTY_STATISTICS, correctClassifications: 9 },
      { outcome: 'uncertain', wrongKeyCount: 0, wrongFingerCount: 0, uncertainCount: 1, fingerErrors: [] },
      0,
      1,
    )
    expect(uncertain.failedAttempts).toBe(0)
    expect(accuracy(uncertain)).toBe(100)
  })

  it('counts a mixed failure once in the headline total', () => {
    const failed = applyGrade(
      EMPTY_STATISTICS,
      { outcome: 'fail', wrongKeyCount: 1, wrongFingerCount: 2, uncertainCount: 0, fingerErrors: [] },
      0,
      5,
    )
    expect(failed).toMatchObject({ failedAttempts: 1, wrongKeys: 1, wrongFingers: 2 })
  })
})

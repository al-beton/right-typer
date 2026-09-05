import { describe, expect, it } from 'vitest'
import { gradeWord, type ObservedKeypress } from '../src/typing/grading'

const correct = { outcome: 'correct', confidence: 0.9, hand: 'left', finger: 'index' } as const

function key(overrides: Partial<ObservedKeypress> = {}): ObservedKeypress {
  return {
    code: 'KeyF',
    actualCharacter: 'f',
    expectedCharacter: 'f',
    timestamp: 1,
    classification: correct,
    ...overrides,
  }
}

describe('word grading', () => {
  it('passes only correct text with confident correct fingers', () => {
    expect(gradeWord('fox', 'fox', [key(), key(), key()]).outcome).toBe('pass')
  })

  it('fails once while retaining detailed text and finger reasons', () => {
    const grade = gradeWord('fox', 'fix', [
      key(),
      key({ classification: { outcome: 'wrong', confidence: 0.8, hand: 'right', finger: 'index' } }),
      key(),
    ])
    expect(grade).toMatchObject({ outcome: 'fail', wrongKeyCount: 1, wrongFingerCount: 1 })
  })

  it('makes a tracking-only uncertainty a free retry', () => {
    const grade = gradeWord('fox', 'fox', [
      key({ classification: { outcome: 'uncertain', confidence: 0, reason: 'hidden hand' } }),
    ])
    expect(grade).toMatchObject({ outcome: 'uncertain', uncertainCount: 1 })
  })
})


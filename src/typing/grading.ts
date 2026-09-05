import type { Classification } from '../tracking/classifier'
import { TARGET_BY_CODE } from './fingerMap'

export interface ObservedKeypress {
  code: string
  actualCharacter: string
  expectedCharacter: string
  timestamp: number
  classification: Classification
}

export interface FingerError {
  character: string
  expected: string
  observed: string
}

export interface WordGrade {
  outcome: 'pass' | 'fail' | 'uncertain'
  wrongKeyCount: number
  wrongFingerCount: number
  uncertainCount: number
  fingerErrors: FingerError[]
}

export function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[right.length] ?? left.length
}

export function gradeWord(expectedWord: string, typedWord: string, keys: ObservedKeypress[]): WordGrade {
  const wrongKeyCount = editDistance(expectedWord, typedWord)
  const wrongFingerKeys = keys.filter((key) => key.classification.outcome === 'wrong')
  const uncertainCount = keys.filter((key) => key.classification.outcome === 'uncertain').length
  const fingerErrors = wrongFingerKeys.map((key) => {
    const target = TARGET_BY_CODE.get(key.code)
    const classification = key.classification
    return {
      character: key.actualCharacter === ' ' ? 'space' : key.actualCharacter,
      expected: target ? `${target.hand} ${target.finger}` : 'unknown',
      observed:
        classification.outcome === 'wrong' ? `${classification.hand} ${classification.finger}` : 'unknown',
    }
  })
  const wrongFingerCount = wrongFingerKeys.length

  if (wrongKeyCount > 0 || wrongFingerCount > 0) {
    return { outcome: 'fail', wrongKeyCount, wrongFingerCount, uncertainCount, fingerErrors }
  }
  if (uncertainCount > 0) {
    return { outcome: 'uncertain', wrongKeyCount, wrongFingerCount, uncertainCount, fingerErrors }
  }
  return { outcome: 'pass', wrongKeyCount, wrongFingerCount, uncertainCount, fingerErrors }
}


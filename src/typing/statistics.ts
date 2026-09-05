import type { WordGrade } from './grading'

export interface LessonStatistics {
  startedAt: number | null
  endedAt: number | null
  acceptedCharacters: number
  correctWords: number
  failedAttempts: number
  wrongKeys: number
  wrongFingers: number
  correctClassifications: number
  uncertainClassifications: number
}

export const EMPTY_STATISTICS: LessonStatistics = {
  startedAt: null,
  endedAt: null,
  acceptedCharacters: 0,
  correctWords: 0,
  failedAttempts: 0,
  wrongKeys: 0,
  wrongFingers: 0,
  correctClassifications: 0,
  uncertainClassifications: 0,
}

export function applyGrade(
  statistics: LessonStatistics,
  grade: WordGrade,
  acceptedCharacters: number,
  classificationCount: number,
): LessonStatistics {
  if (grade.outcome === 'uncertain') {
    return {
      ...statistics,
      uncertainClassifications: statistics.uncertainClassifications + grade.uncertainCount,
    }
  }
  if (grade.outcome === 'fail') {
    return {
      ...statistics,
      failedAttempts: statistics.failedAttempts + 1,
      wrongKeys: statistics.wrongKeys + grade.wrongKeyCount,
      wrongFingers: statistics.wrongFingers + grade.wrongFingerCount,
      correctClassifications:
        statistics.correctClassifications + Math.max(0, classificationCount - grade.wrongFingerCount - grade.uncertainCount),
      uncertainClassifications: statistics.uncertainClassifications + grade.uncertainCount,
    }
  }
  return {
    ...statistics,
    acceptedCharacters: statistics.acceptedCharacters + acceptedCharacters,
    correctWords: statistics.correctWords + 1,
    correctClassifications: statistics.correctClassifications + classificationCount,
  }
}

export function wordsPerMinute(statistics: LessonStatistics): number {
  if (statistics.startedAt === null || statistics.endedAt === null) return 0
  const elapsedMinutes = (statistics.endedAt - statistics.startedAt) / 60_000
  return elapsedMinutes > 0 ? statistics.acceptedCharacters / 5 / elapsedMinutes : 0
}

export function accuracy(statistics: LessonStatistics): number {
  const graded = statistics.correctClassifications + statistics.wrongKeys + statistics.wrongFingers
  return graded > 0 ? (statistics.correctClassifications / graded) * 100 : 100
}


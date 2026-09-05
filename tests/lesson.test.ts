import { describe, expect, it } from 'vitest'
import { FIRST_LESSON, LESSON_WORDS } from '../src/typing/lesson'

describe('first lesson', () => {
  it('is the specified 50-word passage', () => {
    expect(LESSON_WORDS).toHaveLength(50)
  })

  it('contains every letter and only the supported character set', () => {
    expect(FIRST_LESSON.text).toMatch(/^[a-z,. ]+$/)
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') expect(FIRST_LESSON.text).toContain(letter)
  })
})


import { describe, expect, it } from 'vitest'
import { FINGER_TARGETS, TARGET_BY_CODE, isExpectedFinger } from '../src/typing/fingerMap'

describe('finger map', () => {
  it('covers the 31 supported inputs exactly once', () => {
    expect(FINGER_TARGETS).toHaveLength(31)
    expect(new Set(FINGER_TARGETS.map((target) => target.code)).size).toBe(31)
  })

  it('uses the agreed representative fingers', () => {
    expect(TARGET_BY_CODE.get('KeyA')).toMatchObject({ hand: 'left', finger: 'little' })
    expect(TARGET_BY_CODE.get('KeyF')).toMatchObject({ hand: 'left', finger: 'index' })
    expect(TARGET_BY_CODE.get('KeyJ')).toMatchObject({ hand: 'right', finger: 'index' })
    expect(TARGET_BY_CODE.get('KeyP')).toMatchObject({ hand: 'right', finger: 'little' })
    expect(TARGET_BY_CODE.get('KeyC')).toMatchObject({ hand: 'left', finger: 'middle' })
    expect(TARGET_BY_CODE.get('KeyM')).toMatchObject({ hand: 'right', finger: 'index' })
  })

  it('accepts either thumb for space and no other finger', () => {
    const space = TARGET_BY_CODE.get('Space')!
    expect(isExpectedFinger(space, { hand: 'left', finger: 'thumb' })).toBe(true)
    expect(isExpectedFinger(space, { hand: 'right', finger: 'thumb' })).toBe(true)
    expect(isExpectedFinger(space, { hand: 'right', finger: 'index' })).toBe(false)
  })
})

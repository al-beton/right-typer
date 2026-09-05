export type HandSide = 'left' | 'right' | 'either'
export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'little'

export interface FingerTarget {
  code: string
  character: string
  label: string
  hand: HandSide
  finger: FingerName
}

const target = (
  code: string,
  character: string,
  hand: HandSide,
  finger: FingerName,
  label = character,
): FingerTarget => ({ code, character, label, hand, finger })

export const FINGER_TARGETS: readonly FingerTarget[] = [
  target('KeyQ', 'q', 'left', 'little'),
  target('KeyW', 'w', 'left', 'ring'),
  target('KeyE', 'e', 'left', 'middle'),
  target('KeyR', 'r', 'left', 'index'),
  target('KeyT', 't', 'left', 'index'),
  target('KeyY', 'y', 'right', 'index'),
  target('KeyU', 'u', 'right', 'index'),
  target('KeyI', 'i', 'right', 'middle'),
  target('KeyO', 'o', 'right', 'ring'),
  target('KeyP', 'p', 'right', 'little'),
  target('KeyA', 'a', 'left', 'little'),
  target('KeyS', 's', 'left', 'ring'),
  target('KeyD', 'd', 'left', 'middle'),
  target('KeyF', 'f', 'left', 'index'),
  target('KeyG', 'g', 'left', 'index'),
  target('KeyH', 'h', 'right', 'index'),
  target('KeyJ', 'j', 'right', 'index'),
  target('KeyK', 'k', 'right', 'middle'),
  target('KeyL', 'l', 'right', 'ring'),
  target('Semicolon', ';', 'right', 'little', ';'),
  target('KeyZ', 'z', 'left', 'little'),
  target('KeyX', 'x', 'left', 'ring'),
  target('KeyC', 'c', 'left', 'middle'),
  target('KeyV', 'v', 'left', 'index'),
  target('KeyB', 'b', 'left', 'index'),
  target('KeyN', 'n', 'right', 'index'),
  target('KeyM', 'm', 'right', 'index'),
  target('Comma', ',', 'right', 'middle', ','),
  target('Period', '.', 'right', 'ring', '.'),
  target('Slash', '/', 'right', 'little', '/'),
  target('Space', ' ', 'either', 'thumb', 'space'),
] as const

export const TARGET_BY_CODE = new Map(
  FINGER_TARGETS.map((fingerTarget) => [fingerTarget.code, fingerTarget]),
)

export function describeFinger(target: Pick<FingerTarget, 'hand' | 'finger'>): string {
  if (target.hand === 'either') return 'either thumb'
  const finger = target.finger === 'little' ? 'little finger' : `${target.finger} finger`
  return `${target.hand} ${finger}`
}

export function describeObservedFinger(hand: Exclude<HandSide, 'either'>, finger: FingerName): string {
  return describeFinger({ hand, finger })
}

export function isExpectedFinger(
  target: FingerTarget,
  observed: { hand: Exclude<HandSide, 'either'>; finger: FingerName },
): boolean {
  return target.finger === observed.finger && (target.hand === 'either' || target.hand === observed.hand)
}


import type { Finger } from './types';
export const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm,.'];
export const CALIBRATION_KEYS = [...ROWS.join(''), 'space-left', 'space-right'];
const groups: [Finger, string][] = [
  ['left-little', 'qaz'],
  ['left-ring', 'wsx'],
  ['left-middle', 'edc'],
  ['left-index', 'rfvtgb'],
  ['right-index', 'yhnu jm'.replace(' ', '')],
  ['right-middle', 'ik,'],
  ['right-ring', 'ol.'],
  ['right-little', 'p;/'],
];
export const EXPECTED = Object.fromEntries(
  groups.flatMap(([f, keys]) => [...keys].map((k) => [k, f])),
) as Record<string, Finger>;
export const fingerName = (f: Finger) => f.replace('-', ' ');
export const keyName = (key: string) =>
  key === ' ' ? 'space' : key === ',' ? 'comma' : key === '.' ? 'full stop' : key;
export const MODES = {
  standard: 'Standard',
  alternate: 'Alternate diagonal',
  either: 'Either',
  'symmetric-left': 'Symmetric · B left',
  'symmetric-right': 'Symmetric · B right',
} as const;
export type FingeringMode = keyof typeof MODES;
export function isFingeringMode(value: unknown): value is FingeringMode {
  return typeof value === 'string' && Object.hasOwn(MODES, value);
}
// Explicit product interpretation: top row inherits its left neighbour;
// bottom row inherits its right neighbour. Endpoints and home row stay unchanged.
const ALTERNATE: Record<string, Finger> = {
  w: 'left-little',
  e: 'left-ring',
  r: 'left-middle',
  y: 'left-index',
  i: 'right-index',
  o: 'right-middle',
  p: 'right-ring',
  z: 'left-ring',
  x: 'left-middle',
  c: 'left-index',
  b: 'right-index',
  m: 'right-middle',
  ',': 'right-ring',
};
export type SymmetricMode = 'symmetric-left' | 'symmetric-right';
export const isSymmetric = (mode: FingeringMode): mode is SymmetricMode =>
  mode === 'symmetric-left' || mode === 'symmetric-right';
// Physical-position zones. Text/locale and custom output mappings do not select a zone.
const SYMMETRIC_ZONES: [Finger, string[]][] = [
  [
    'left-little',
    [
      'KeyQ',
      'KeyA',
      'Digit1',
      'Backquote',
      'IntlBackslash',
      'Tab',
      'CapsLock',
      'ShiftLeft',
      'ControlLeft',
      'AltLeft',
      'MetaLeft',
    ],
  ],
  ['left-ring', ['KeyW', 'KeyS', 'KeyZ', 'Digit2']],
  ['left-middle', ['KeyE', 'KeyD', 'KeyX', 'Digit3', 'Digit4']],
  ['left-index', ['KeyR', 'KeyT', 'KeyF', 'KeyG', 'KeyC', 'KeyV', 'Digit5', 'Digit6']],
  ['right-index', ['KeyY', 'KeyU', 'KeyH', 'KeyJ', 'KeyN', 'KeyM', 'Digit7']],
  ['right-middle', ['KeyI', 'KeyK', 'Comma', 'Digit8', 'Digit9']],
  ['right-ring', ['KeyO', 'KeyL', 'Period', 'Digit0']],
  [
    'right-little',
    [
      'KeyP',
      'Semicolon',
      'Slash',
      'Minus',
      'Equal',
      'BracketLeft',
      'BracketRight',
      'Backslash',
      'Quote',
      'Backspace',
      'Enter',
      'ShiftRight',
      'ControlRight',
      'AltRight',
      'MetaRight',
      'ContextMenu',
    ],
  ],
];
const symmetricZones = new Map(
  SYMMETRIC_ZONES.flatMap(([finger, codes]) => codes.map((code) => [code, finger] as const)),
);
export function symmetricFingers(code: string, mode: FingeringMode): Finger[] | undefined {
  if (!isSymmetric(mode)) return undefined;
  if (code === 'Space') return ['left-thumb', 'right-thumb'];
  if (code === 'KeyB') return [mode === 'symmetric-left' ? 'left-index' : 'right-index'];
  const finger = symmetricZones.get(code);
  return finger ? [finger] : undefined;
}
export const modeHelp = (mode: FingeringMode) =>
  isSymmetric(mode)
    ? `Standard top/home rows; Z ring, X middle, C/V index on the left. B uses ${mode === 'symmetric-left' ? 'left' : 'right'} index. Fixed physical zones; extra custom keys use Standard fingers.`
    : '';

export function allowedFingers(key: string, mode: FingeringMode = 'standard'): Finger[] {
  if (key === ' ') return ['left-thumb', 'right-thumb'];
  if (isSymmetric(mode)) {
    // Profile-less historical QWERTY samples retain their character-to-position interpretation.
    const code =
      key === ','
        ? 'Comma'
        : key === '.'
          ? 'Period'
          : key === ';'
            ? 'Semicolon'
            : key === '/'
              ? 'Slash'
              : `Key${key.toUpperCase()}`;
    return symmetricFingers(code, mode) ?? [];
  }
  const standard = EXPECTED[key];
  if (!standard) return [];
  const alternate = ALTERNATE[key] ?? standard;
  return mode === 'either'
    ? [...new Set([standard, alternate])]
    : [mode === 'alternate' ? alternate : standard];
}
export function isCorrectFinger(
  key: string,
  finger: Finger,
  mode: FingeringMode = 'standard',
): boolean {
  return allowedFingers(key, mode).includes(finger);
}
export function intended(key: string, mode: FingeringMode = 'standard'): string {
  return key === ' '
    ? 'either thumb'
    : allowedFingers(key, mode).map(fingerName).join(' or ') || 'the intended finger';
}
export function policyLabel(modes: FingeringMode[]): string {
  return modes.length > 1
    ? `Mixed: ${modes.map((m) => MODES[m]).join(' + ')}`
    : MODES[modes[0] ?? 'standard'];
}
export const LANDMARK_TIPS = [4, 8, 12, 16, 20];
export const DIGITS = ['thumb', 'index', 'middle', 'ring', 'little'] as const;

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
export function allowedFingers(key: string, mode: FingeringMode = 'standard'): Finger[] {
  if (key === ' ') return ['left-thumb', 'right-thumb'];
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

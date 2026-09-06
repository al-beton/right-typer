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
export function isCorrectFinger(key: string, finger: Finger): boolean {
  return key === ' ' ? finger.endsWith('-thumb') : EXPECTED[key] === finger;
}
export function intended(key: string): string {
  return key === ' '
    ? 'either thumb'
    : EXPECTED[key]
      ? fingerName(EXPECTED[key])
      : 'the intended finger';
}
export const LANDMARK_TIPS = [4, 8, 12, 16, 20];
export const DIGITS = ['thumb', 'index', 'middle', 'ring', 'little'] as const;

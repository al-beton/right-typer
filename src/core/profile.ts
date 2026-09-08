import { allowedFingers, type FingeringMode } from './keyboard';
import type { Finger } from './types';
export type Output = { text: string; shift: boolean; altGr: boolean };
export type PhysicalKey = {
  code: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  outputs: Output[];
  standard: Finger[];
  alternate: Finger[];
};
export type KeyboardProfile = {
  version: 1;
  id: string;
  name: string;
  geometry: string;
  keys: PhysicalKey[];
};
export const LEGACY_CODES = Object.fromEntries(
  [...'qwertyuiopasdfghjklzxcvbnm,.'].map((k) => [
    k,
    k === ',' ? 'Comma' : k === '.' ? 'Period' : `Key${k.toUpperCase()}`,
  ]),
);
const rows = ['qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'];
function preset(
  id: string,
  name: string,
  geometry: 'ANSI' | 'ISO',
  letters = rows,
): KeyboardProfile {
  const keys = rows.flatMap((row, y) =>
    [...row].map((k, x): PhysicalKey => {
      const text = letters[y]![x]!;
      return {
        code: LEGACY_CODES[k] ?? (k === ';' ? 'Semicolon' : 'Slash'),
        label: text,
        x: x + [0, 0.25, 0.75][y]!,
        y,
        width: 1,
        height: 1,
        outputs: [{ text, shift: false, altGr: false }],
        standard: allowedFingers(k),
        alternate: allowedFingers(k, 'alternate'),
      };
    }),
  );
  keys.push({
    code: 'Space',
    label: 'space',
    x: 2,
    y: 3,
    width: 6,
    height: 1,
    outputs: [{ text: ' ', shift: false, altGr: false }],
    standard: ['left-thumb', 'right-thumb'],
    alternate: ['left-thumb', 'right-thumb'],
  });
  // Retain the extra physical position for custom mappings; practice hides unused keys.
  if (geometry === 'ISO')
    keys.push({
      code: 'IntlBackslash',
      label: id === 'apple-gb-iso' ? '`' : id === 'gb-iso' ? '\\' : '<',
      x: -0.25,
      y: 2,
      width: 1,
      height: 1,
      outputs: [],
      standard: ['left-little'],
      alternate: ['left-little'],
    });
  return { version: 1, id, name, geometry, keys };
}
export const PRESETS = [
  preset('us-ansi', 'US QWERTY — ANSI', 'ANSI'),
  preset('gb-iso', 'British QWERTY — ISO (PC)', 'ISO'),
  preset('apple-gb-iso', 'Apple British QWERTY — ISO', 'ISO'),
  preset('de-iso', 'German QWERTZ — ISO (PC)', 'ISO', ['qwertzuiop', 'asdfghjklö', 'yxcvbnm,.-']),
  preset('fr-iso', 'French Legacy AZERTY — ISO (PC)', 'ISO', [
    'azertyuiop',
    'qsdfghjklm',
    'wxcvbn,;:!',
  ]),
];
// Dedicated regional letter keys, at their physical positions. They are shown
// even though the current English passage does not require them for calibration.
function regionalKey(
  p: KeyboardProfile,
  code: string,
  text: string,
  x: number,
  y: number,
  finger: Finger,
) {
  p.keys.push({
    code,
    label: text,
    x,
    y,
    width: 1,
    height: 1,
    outputs: [{ text, shift: false, altGr: false }],
    standard: [finger],
    alternate: [finger],
  });
}
regionalKey(PRESETS[3]!, 'BracketLeft', 'ü', 10, 0, 'right-little');
regionalKey(PRESETS[3]!, 'Quote', 'ä', 10.25, 1, 'right-little');
regionalKey(PRESETS[3]!, 'Minus', 'ß', 9.5, -1, 'right-little');
regionalKey(PRESETS[4]!, 'Digit2', 'é', 0.5, -1, 'left-ring');
regionalKey(PRESETS[4]!, 'Digit7', 'è', 5.5, -1, 'right-index');
regionalKey(PRESETS[4]!, 'Digit9', 'ç', 7.5, -1, 'right-ring');
regionalKey(PRESETS[4]!, 'Digit0', 'à', 8.5, -1, 'right-little');
regionalKey(PRESETS[4]!, 'Quote', 'ù', 10.25, 1, 'right-little');
export const displayCharacters = (key: PhysicalKey) => [
  ...new Set(key.outputs.map((o) => o.text).filter((text) => /^[\p{L},.]$/u.test(text))),
];
const frenchPeriod = PRESETS[4]!.keys.find((k) => k.code === 'Comma')!;
frenchPeriod.outputs.push({ text: '.', shift: true, altGr: false });
frenchPeriod.label = '; / .';
export const profileFingers = (p: KeyboardProfile, code: string, mode: FingeringMode): Finger[] => {
  const key = p.keys.find((k) => k.code === code);
  if (!key) return [];
  return mode === 'either' ? [...new Set([...key.standard, ...key.alternate])] : [...key[mode]];
};
export const characterKey = (p: KeyboardProfile, text: string) =>
  p.keys.find((k) => k.outputs.some((o) => o.text === text));
export const coverage = (p: KeyboardProfile) =>
  [...'abcdefghijklmnopqrstuvwxyz,. '].filter((c) => !characterKey(p, c));
export const calibrationCodes = (p: KeyboardProfile) => [
  ...p.keys
    .filter((k) => k.code !== 'Space' && k.outputs.some((o) => /^[a-z,.]$/.test(o.text)))
    .map((k) => k.code),
  'space-left',
  'space-right',
];
export function geometrySignature(p: KeyboardProfile): string {
  return JSON.stringify({
    geometry: p.geometry,
    keys: p.keys
      .filter((k) => k.code === 'Space' || calibrationCodes(p).includes(k.code))
      .map((k) => [k.code, k.x, k.y, k.width, k.height])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    targets: calibrationCodes(p).sort(),
  });
}
const finger = (f: unknown): f is Finger =>
  typeof f === 'string' && /^(left|right)-(thumb|index|middle|ring|little)$/.test(f);
export function parseProfile(text: string): KeyboardProfile {
  if (text.length > 100000) throw Error('Profile exceeds 100 KB.');
  const p = JSON.parse(text) as KeyboardProfile;
  if (
    !p ||
    p.version !== 1 ||
    typeof p.id !== 'string' ||
    !/^[-a-zA-Z0-9_]{1,80}$/.test(p.id) ||
    ['__proto__', 'constructor', 'prototype'].includes(p.id) ||
    typeof p.name !== 'string' ||
    !p.name.trim() ||
    p.name.length > 80 ||
    typeof p.geometry !== 'string' ||
    p.geometry.length > 80 ||
    !Array.isArray(p.keys) ||
    p.keys.length < 3 ||
    p.keys.length > 100
  )
    throw Error('Expected a version 1 profile with a name, geometry and 3–100 keys.');
  const codes = new Set<string>();
  for (const k of p.keys) {
    if (
      !k ||
      typeof k.code !== 'string' ||
      !/^(Key[A-Z]|Digit[0-9]|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Comma|Equal|Enter)|Space|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|IntlBackslash|IntlRo|IntlYen)$/.test(
        k.code,
      ) ||
      codes.has(k.code) ||
      typeof k.label !== 'string' ||
      k.label.length > 30 ||
      ![k.x, k.y, k.width, k.height].every(Number.isFinite) ||
      Math.abs(k.x) > 100 ||
      Math.abs(k.y) > 100 ||
      k.width <= 0 ||
      k.height <= 0 ||
      k.width > 20 ||
      k.height > 20 ||
      !Array.isArray(k.outputs) ||
      k.outputs.length > 8 ||
      !['standard', 'alternate'].every((m) => {
        const a = k[m as 'standard'];
        return Array.isArray(a) && a.length > 0 && a.length <= 2 && a.every(finger);
      })
    )
      throw Error(
        'Each key needs a unique browser character-key code (for example KeyQ), bounded geometry, label and explicit Standard/Alternate fingers.',
      );
    codes.add(k.code);
    const states = new Set<string>();
    for (const o of k.outputs) {
      if (
        !o ||
        typeof o.text !== 'string' ||
        [...o.text].length !== 1 ||
        typeof o.shift !== 'boolean' ||
        typeof o.altGr !== 'boolean' ||
        states.has(`${o.shift}/${o.altGr}`)
      )
        throw Error(`Invalid or duplicate modifier mapping for ${k.code}.`);
      states.add(`${o.shift}/${o.altGr}`);
    }
  }
  const space = p.keys.find((k) => k.code === 'Space');
  if (
    !space ||
    !space.outputs.some((o) => o.text === ' ') ||
    !['standard', 'alternate'].every(
      (m) =>
        space[m as 'standard'].length === 2 &&
        space[m as 'standard'].includes('left-thumb') &&
        space[m as 'standard'].includes('right-thumb'),
    )
  )
    throw Error('Space must allow either thumb in both policies.');
  return structuredClone(p);
}
export type KeyEvent = Pick<
  KeyboardEvent,
  | 'code'
  | 'key'
  | 'shiftKey'
  | 'altKey'
  | 'ctrlKey'
  | 'metaKey'
  | 'isComposing'
  | 'getModifierState'
>;
export function resolveEvent(
  p: KeyboardProfile,
  e: KeyEvent,
): { code: string } | { error: string } {
  if (e.isComposing || ['Dead', 'Process', 'Unidentified'].includes(e.key))
    return {
      error:
        'Composition/dead keys cannot be observed. Use a direct keyboard input source or edit this profile.',
    };
  const altGr = e.getModifierState('AltGraph');
  const key = p.keys.find((k) => k.code === e.code);
  if (
    e.metaKey ||
    ((e.ctrlKey || e.altKey) && !altGr) ||
    !key?.outputs.some((o) => o.text === e.key && o.shift === e.shiftKey && o.altGr === altGr)
  )
    return {
      error:
        'This key does not match the selected profile. Select your keyboard or edit its mapping in Custom.',
    };
  return { code: e.code };
}
export function suggestProfiles(map: ReadonlyMap<string, string>): KeyboardProfile[] {
  const probes = ['KeyQ', 'KeyW', 'KeyA', 'KeyY', 'KeyZ', 'KeyM', 'Semicolon', 'Comma', 'Period'];
  if (probes.some((c) => !map.has(c))) return [];
  return PRESETS.filter((p) =>
    probes.every(
      (code) =>
        p.keys.find((k) => k.code === code)?.outputs.find((o) => !o.shift && !o.altGr)?.text ===
        map.get(code),
    ),
  );
}

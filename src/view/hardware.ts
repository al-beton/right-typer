import { displayCharacters, type KeyboardProfile } from '../core/profile';

// Drawing only. These keys never add outputs, camera targets or grading rules.
// Geometry is in key pitches relative to Q; sources and audit in docs/keyboard-fidelity.md.
export type HardwareKey = {
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
  legends: string[];
  isoReturn?: boolean;
};
export const HARDWARE: Record<string, { model: string; language: string; family: 'mac' | 'pc' }> = {
  'us-ansi': { model: 'Keychron V6 · ANSI', language: 'US QWERTY · Windows', family: 'pc' },
  'gb-iso': { model: 'Keychron V6 · ISO', language: 'British QWERTY · Windows', family: 'pc' },
  'apple-gb-iso': {
    model: 'MacBook Air M2 / Pro 2021+ · ISO',
    language: 'British QWERTY · macOS',
    family: 'mac',
  },
  'de-iso': { model: 'Keychron V6 · ISO', language: 'German QWERTZ · Windows', family: 'pc' },
  'fr-iso': {
    model: 'Keychron V6 · ISO',
    language: 'French legacy AZERTY · Windows',
    family: 'pc',
  },
  'apple-us-ansi': {
    model: 'MacBook Air M2 / Pro 2021+ · ANSI',
    language: 'US QWERTY · macOS',
    family: 'mac',
  },
};
// Unshifted, Shift, optional AltGr legends. Empty slots are intentionally absent.
const us = {
  Backquote: ['`', '~'],
  Digit1: ['1', '!'],
  Digit2: ['2', '@'],
  Digit3: ['3', '#'],
  Digit4: ['4', '$'],
  Digit5: ['5', '%'],
  Digit6: ['6', '^'],
  Digit7: ['7', '&'],
  Digit8: ['8', '*'],
  Digit9: ['9', '('],
  Digit0: ['0', ')'],
  Minus: ['-', '_'],
  Equal: ['=', '+'],
  BracketLeft: ['[', '{'],
  BracketRight: [']', '}'],
  Backslash: ['\\', '|'],
  Semicolon: [';', ':'],
  Quote: ["'", '"'],
  Comma: [',', '<'],
  Period: ['.', '>'],
  Slash: ['/', '?'],
};
const legends: Record<string, Record<string, string[]>> = {
  'us-ansi': us,
  'apple-us-ansi': us,
  'gb-iso': {
    ...us,
    Backquote: ['`', '¬', '¦'],
    Digit2: ['2', '"'],
    Digit3: ['3', '£'],
    Digit4: ['4', '$', '€'],
    Quote: ["'", '@'],
    Backslash: ['#', '~'],
    IntlBackslash: ['\\', '|'],
  },
  'apple-gb-iso': { ...us, Backquote: ['§', '±'], Digit3: ['3', '£'], IntlBackslash: ['`', '~'] },
  'de-iso': {
    Backquote: ['^', '°'],
    Digit1: ['1', '!'],
    Digit2: ['2', '"', '²'],
    Digit3: ['3', '§', '³'],
    Digit4: ['4', '$'],
    Digit5: ['5', '%'],
    Digit6: ['6', '&'],
    Digit7: ['7', '/', '{'],
    Digit8: ['8', '(', '['],
    Digit9: ['9', ')', ']'],
    Digit0: ['0', '=', '}'],
    Minus: ['ß', '?', '\\'],
    Equal: ['´', '`'],
    BracketLeft: ['Ü'],
    BracketRight: ['+', '*', '~'],
    Semicolon: ['Ö'],
    Quote: ['Ä'],
    Backslash: ['#', "'"],
    IntlBackslash: ['<', '>', '|'],
    Comma: [',', ';'],
    Period: ['.', ':'],
    Slash: ['-', '_'],
  },
  'fr-iso': {
    Backquote: ['²'],
    Digit1: ['&', '1'],
    Digit2: ['é', '2'],
    Digit3: ['"', '3'],
    Digit4: ["'", '4'],
    Digit5: ['(', '5'],
    Digit6: ['-', '6', '|'],
    Digit7: ['è', '7'],
    Digit8: ['_', '8', '\\'],
    Digit9: ['ç', '9'],
    Digit0: ['à', '0'],
    Minus: [')', '°'],
    Equal: ['=', '+'],
    BracketLeft: ['^', '¨'],
    BracketRight: ['$', '£', '¤'],
    Semicolon: ['M'],
    Quote: ['ù', '%'],
    Backslash: ['*', 'µ'],
    IntlBackslash: ['<', '>'],
    KeyM: [',', '?'],
    Comma: [';', '.'],
    Period: [':', '/'],
    Slash: ['!', '§'],
  },
};
export function hardwareKeys(p: KeyboardProfile): HardwareKey[] {
  const reference = HARDWARE[p.id];
  if (!reference)
    return p.keys
      .filter((k) => k.code === 'Space' || displayCharacters(k).length)
      .map((k) => ({
        ...k,
        legends:
          k.code === 'Space'
            ? []
            : displayCharacters(k).map((s) => (/^[a-z]$/.test(s) ? s.toUpperCase() : s)),
      }));
  const mac = reference.family === 'mac',
    iso = p.geometry === 'ISO',
    right = mac ? 13 : 13.5;
  const map = legends[p.id]!;
  const keys: HardwareKey[] = [];
  const add = (code: string, x: number, y: number, width = 1, height = 1, text?: string) => {
    const physical = p.keys.find((k) => k.code === code);
    keys.push({
      code,
      x,
      y,
      width,
      height,
      legends:
        code === 'Space' ? [] : (map[code] ?? [text ?? physical?.label.toUpperCase() ?? code]),
    });
  };
  ['Backquote', ...'1234567890'.split('').map((n) => `Digit${n}`), 'Minus', 'Equal'].forEach(
    (code, i) => add(code, i - 1.5, -1),
  );
  add('Backspace', 11.5, -1, right - 11.5, 1, '⌫');
  add('Tab', -1.5, 0, 1.5, 1, '⇥');
  [...'QWERTYUIOP'].forEach((c, i) => add(`Key${c}`, i, 0));
  add('BracketLeft', 10, 0);
  add('BracketRight', 11, 0);
  add('CapsLock', -1.5, 1, 1.75, 1, '⇪');
  [...'ASDFGHJKL'].forEach((c, i) => add(`Key${c}`, i + 0.25, 1));
  add('Semicolon', 9.25, 1);
  add('Quote', 10.25, 1);
  if (iso) {
    add('Backslash', 11.25, 1);
    add('Enter', 12, 0, right - 12, 2, '↵');
    keys.at(-1)!.isoReturn = true;
  } else {
    add('Backslash', 12, 0, right - 12);
    add('Enter', 11.25, 1, right - 11.25, 1, '↵');
  }
  add('ShiftLeft', -1.5, 2, iso ? 1.25 : 2.25, 1, '⇧');
  if (iso) add('IntlBackslash', -0.25, 2);
  [...'ZXCVBNM'].forEach((c, i) => add(`Key${c}`, i + 0.75, 2));
  add('Comma', 7.75, 2);
  add('Period', 8.75, 2);
  add('Slash', 9.75, 2);
  add('ShiftRight', 10.75, 2, right - 10.75, 1, '⇧');
  const space = p.keys.find((k) => k.code === 'Space')!;
  add('Space', space.x, 3, space.width);
  if (mac) {
    add('Fn', -1.5, 3, 1, 1, 'fn');
    add('ControlLeft', -0.5, 3, 1, 1, '⌃');
    add('AltLeft', 0.5, 3, 1, 1, '⌥');
    add('MetaLeft', 1.5, 3, 1.25, 1, '⌘');
    add('MetaRight', 7.75, 3, 1.25, 1, '⌘');
    add('AltRight', 9, 3, 1, 1, '⌥');
    add('ArrowLeft', 10, 3.5, 1, 0.5, '◂');
    add('ArrowUp', 11, 3, 1, 0.5, '▴');
    add('ArrowDown', 11, 3.5, 1, 0.5, '▾');
    add('ArrowRight', 12, 3.5, 1, 0.5, '▸');
  } else {
    ['Ctrl', 'Win', 'Alt'].forEach((s, i) =>
      add(['ControlLeft', 'MetaLeft', 'AltLeft'][i]!, i * 1.25 - 1.5, 3, 1.25, 1, s),
    );
    ['Alt Gr', 'Win', 'Fn', 'Ctrl'].forEach((s, i) =>
      add(
        ['AltRight', 'MetaRight', 'Fn', 'ControlRight'][i]!,
        8.5 + i * 1.25,
        3,
        1.25,
        1,
        s === 'Alt Gr' && p.id === 'us-ansi' ? 'Alt' : s,
      ),
    );
  }
  return keys;
}

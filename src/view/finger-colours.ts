import type { Finger } from '../core/types';

// Physical left-to-right order, shared by the keyboard and camera markers.
const COLOUR_ORDER: readonly Finger[] = [
  'left-little',
  'left-ring',
  'left-middle',
  'left-index',
  'left-thumb',
  'right-thumb',
  'right-index',
  'right-middle',
  'right-ring',
  'right-little',
];

export function orderedFingers(fingers: readonly Finger[]): Finger[] {
  return [...fingers].sort((a, b) => COLOUR_ORDER.indexOf(a) - COLOUR_ORDER.indexOf(b));
}

export function fingerBackground(fingers: readonly Finger[]): string {
  const ordered = orderedFingers(fingers);
  if (!ordered.length) return 'transparent';
  if (ordered.length === 1) return `var(--${ordered[0]})`;
  if (ordered.length === 2)
    return `linear-gradient(90deg,var(--${ordered[0]}) 50%,var(--${ordered[1]}) 50%)`;
  return `linear-gradient(90deg,${ordered
    .map(
      (finger, i) =>
        `var(--${finger}) ${(i * 100) / ordered.length}% ${((i + 1) * 100) / ordered.length}%`,
    )
    .join(',')})`;
}

export type FingerPalette = Record<Finger, string>;
export function readFingerPalette(style: CSSStyleDeclaration): FingerPalette {
  return Object.fromEntries(
    COLOUR_ORDER.map((finger) => [finger, style.getPropertyValue(`--${finger}`).trim()]),
  ) as FingerPalette;
}

import { EXPECTED } from '../core/keyboard';

// Selected branding follows the ten Standard QWERTY columns, not the fingers
// used to type the name: both index-finger colours occupy two columns.
const columns = [...'qwertyuiop'].map((key) => EXPECTED[key]!);

export function brandWordmark(): string {
  let column = 0;
  return [...'Right Typer']
    .map((letter) =>
      letter === ' '
        ? '<span class="brand-gap"> </span>'
        : `<span style="--brand-colour:var(--${columns[column++]})">${letter}</span>`,
    )
    .join('');
}

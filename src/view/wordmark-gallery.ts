import '../style.css';
import './wordmark-gallery.css';
import { EXPECTED } from '../core/keyboard';
import type { Finger } from '../core/types';

const sequence: Finger[] = [
  'left-little',
  'left-ring',
  'left-middle',
  'left-index',
  'right-index',
  'right-middle',
  'right-ring',
  'right-little',
];
const options = [
  [
    '01',
    'Sequential',
    'seq',
    'Keyboard palette, left to right; repeats after eight letters. A thin ink outline keeps the pastel letters readable.',
  ],
  [
    '02',
    'Space between',
    'space',
    'The same sequence in monospace, with both thumb colours marking the word gap.',
  ],
  [
    '03',
    'Quiet underline',
    'ink',
    'Plain ink lettering with a small palette underline per letter. Both thumb colours sit beneath the space.',
  ],
  [
    '04',
    'Keys to letters',
    'mapped',
    'Actual Standard QWERTY finger mapping for each letter. A comparison, not the sequential palette or your selected keyboard profile.',
  ],
] as const;

function wordmark(name: string, style: string) {
  let index = 0;
  const letters = [...name]
    .map((letter) => {
      if (letter === ' ') return '<span class="wm-gap"> </span>';
      const finger =
        style === 'mapped' ? EXPECTED[letter.toLowerCase()]! : sequence[index++ % sequence.length]!;
      return `<span class="wm-letter" style="--wm-colour:var(--${finger})">${letter}</span>`;
    })
    .join('');
  return `<span class="wordmark wm-${style}" role="img" aria-label="${name}"><span aria-hidden="true">${letters}</span></span>`;
}

export function renderGallery() {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  const params = new URLSearchParams(location.search);
  let name = params.get('name') === 'bright' ? 'Bright Typer' : 'Right Typer';
  app.innerHTML = `
    <header class="topbar"><h1>Wordmark studies</h1><a href="${location.pathname}">Back to app</a></header>
    <main class="wm-review">
      <div class="wm-intro"><p class="eyebrow">ALO-259 · DESIGN REVIEW</p>
      <h2>One name. Four small variations.</h2>
      <p>Compare at 22px, the app’s header size, and enlarged. No design is selected yet.</p></div>
      <label class="wm-switch">Display text <select id="wm-name"><option>Right Typer</option><option>Bright Typer</option></select></label>
      <p class="wm-note">Text changes only these examples. The project remains Right Typer.</p>
      <div class="wm-grid"></div>
      <section class="wm-palette" aria-labelledby="palette-title"><h2 id="palette-title">From the keyboard</h2>
        <div class="wm-swatches">${[...sequence.slice(0, 4), 'left-thumb', 'right-thumb', ...sequence.slice(4)].map((f) => `<span><i style="background:var(--${f})"></i>${f.replace('-', ' ')}</span>`).join('')}</div>
        <p>The requested red / orange / yellow / green / lilac / blue / purple / pink order follows the eight fingers. Current tokens render rose at “red” and cyan at “lilac”; these examples preserve the actual keyboard colours.</p>
        <p>Pastel fills alone have low contrast on the app’s #fafafa background. Options 01, 02 and 04 use an ink outline; 03 keeps the text in ink and the colours as decoration.</p>
      </section>
      <footer><span>Review only · Editable CSS typography</span><span id="build-version" aria-label="App version">${import.meta.env.VITE_BUILD_LABEL} · <a href="https://github.com/al-beton/right-typer/commit/${import.meta.env.VITE_BUILD_SHA}">${import.meta.env.VITE_BUILD_SHA.slice(0, 7)}</a></span></footer>
    </main>`;
  const select = app.querySelector<HTMLSelectElement>('#wm-name')!;
  const render = () => {
    select.value = name;
    app.querySelector('.wm-grid')!.innerHTML = options
      .map(
        ([number, title, style, description]) => `
      <article class="wm-card"><div class="wm-card-title"><span>${number}</span><h2>${title}</h2></div>
      <div class="wm-large">${wordmark(name, style)}</div>
      <div class="wm-header"><span class="wm-size">22px / header</span>${wordmark(name, style)}</div>
      <p>${description}</p></article>`,
      )
      .join('');
  };
  select.addEventListener('change', () => {
    name = select.value;
    params.set('name', name === 'Bright Typer' ? 'bright' : 'right');
    history.replaceState(null, '', `${location.pathname}?${params}`);
    render();
  });
  render();
}

import '../style.css';
import './wordmark-gallery.css';
import { EXPECTED } from '../core/keyboard';

// The Standard QWERTY top row has two columns for each index finger.
const keys = [...'qwertyuiop'];
const sequence = keys.map((key) => EXPECTED[key]!);
const options = [
  [
    'seq',
    '01',
    'Sequential',
    'Ten letters, ten keyboard columns. Two greens meet two turquoises at the word gap.',
  ],
  [
    'ink',
    '02',
    'Quiet underline',
    'Ink lettering with a small colour segment beneath each letter. The lightest touch at header size.',
  ],
  [
    'rail',
    '03',
    'Keyboard underline',
    'A single, even ten-column line. The wider green and turquoise regions echo the keyboard.',
  ],
] as const;
const icons = [
  [
    'rt',
    'RT underline',
    'A matching Quiet underline favicon: five keyboard colours under R, five under T.',
  ],
  ['split', 'Index pair', 'RT over two green and two turquoise columns.'],
  ['key', 'Quiet key', 'One compact key and a ten-column colour line.'],
] as const;
const iconPath = (id: string, format = 'svg') =>
  `./wordmarks/${id}.${format}?v=${import.meta.env.VITE_REVIEW_SHA}`;

function wordmark(name: string, style: string, thumbs: boolean) {
  let index = 0;
  const letters = [...name]
    .map((letter) => {
      if (letter === ' ') return '<span class="wm-gap"> </span>';
      // Bright has one extra initial: B/r share the first (rose) keyboard column.
      const column = name === 'Bright Typer' ? Math.max(0, index++ - 1) : index++;
      return `<span class="wm-letter" data-column="${column}" style="--wm-colour:var(--${sequence[column]})">${letter}</span>`;
    })
    .join('');
  const rail = sequence.map((finger) => `<i style="background:var(--${finger})"></i>`).join('');
  return `<span class="wordmark wm-${style}${thumbs ? ' wm-thumbs' : ''}" role="img" aria-label="${name}"><span class="wm-letters" aria-hidden="true">${letters}</span>${style === 'rail' ? `<span class="wm-rail" aria-hidden="true">${rail}</span>` : ''}</span>`;
}

export function renderGallery() {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  const params = new URLSearchParams(location.search);
  let name = params.get('name') === 'bright' ? 'Bright Typer' : 'Right Typer';
  let style = options.find(([id]) => id === params.get('style'))?.[0] ?? 'ink';
  let icon = icons.find(([id]) => id === params.get('icon'))?.[0] ?? 'rt';
  let thumbs = params.get('thumbs') === '1';
  app.innerHTML = `
    <header class="topbar"><h1>Wordmark studies</h1><a href="./">Back to app</a></header>
    <main class="wm-review">
      <div class="wm-intro"><p class="eyebrow">ROUND 02 · TEN KEYBOARD COLUMNS</p>
        <h2>Quiet underline, with its favicon.</h2>
        <p>Your preferred wordmark, paired with ink initials and matching colour underlines.</p>
      </div>
      <section class="wm-approved" aria-label="Preferred Quiet underline pairing"><div><p class="eyebrow">YOUR CHOICE · QUIET UNDERLINE</p>${wordmark('Right Typer', 'ink', false)}</div><div class="wm-approved-icon"><img src="${iconPath('rt')}" width="64" height="64" alt="Matching RT underline favicon"><div><strong>RT underline</strong><p>Matching favicon · <a href="${iconPath('rt', 'ico')}" download>Download ICO</a></p></div></div></section>
      <div class="wm-controls"><label>Display text <select id="wm-name"><option>Right Typer</option><option>Bright Typer</option></select></label>
        <label><input id="wm-thumbs" type="checkbox"> Add thumb colours in the word gap</label></div>
      <section class="wm-pairing" aria-label="Selected header and tab preview">
        <div class="wm-tab"><img class="wm-tab-icon" width="16" height="16" alt=""><span class="wm-tab-title"></span><span aria-hidden="true">×</span></div>
        <div class="wm-header-preview"><span id="wm-chosen"></span><span class="wm-source">Source on GitHub</span></div>
        <p class="wm-note">22px header · 16px tab icon. Choose a wordmark and favicon below to try them together.</p>
      </section>
      <div class="wm-grid"></div>
      <section class="wm-mapping" aria-labelledby="mapping-title"><h2 id="mapping-title">The sequence, column by column</h2>
        <p>From the visible Standard QWERTY keyboard. This is a colour sequence for the name, not fingering instructions for its letters.</p>
        <div class="wm-map"></div><p class="wm-name-note"></p>
      </section>
      <section class="wm-favicons" aria-labelledby="favicon-title"><div class="wm-section-heading"><h2 id="favicon-title">A small companion for the tab</h2><p>Try each in this browser tab. Downloads include SVG, PNG and ICO.</p></div>
        <div class="wm-icon-grid">${icons
          .map(
            ([id, title, description]) => `<article class="wm-icon-card"><h3>${title}</h3>
          <div class="wm-icon-sizes"><figure><img src="${iconPath(id)}" width="64" height="64" alt="${title} enlarged"><figcaption>64px</figcaption></figure><figure><img src="${iconPath(id, '32.png')}" width="32" height="32" alt="${title} at 32 pixels"><figcaption>32px</figcaption></figure><figure><img src="${iconPath(id, '16.png')}" width="16" height="16" alt="${title} at 16 pixels"><figcaption>16px</figcaption></figure></div>
          <div class="wm-tab wm-dark-tab"><img src="${iconPath(id, '16.png')}" width="16" height="16" alt=""><span>Right Typer</span><span aria-hidden="true">×</span></div>
          <p>${description}</p><button type="button" data-icon="${id}" aria-pressed="false">Try in tab</button>
          <div class="wm-downloads"><a href="${iconPath(id)}" download>SVG</a><a href="${iconPath(id, '32.png')}" download>PNG</a><a href="${iconPath(id, 'ico')}" download>ICO</a></div></article>`,
          )
          .join('')}</div>
        <p class="wm-note" id="wm-icon-status" role="status"></p>
      </section>
      <p class="wm-note">Review only. The project remains Right Typer; the normal app’s logo and favicon are unchanged. Pastel letters use an ink outline; the two underline options keep solid, high-contrast ink text.</p>
      <footer><span>Editable CSS wordmarks · SVG favicon masters</span><span id="build-version" aria-label="App version">Build · <a href="https://github.com/al-beton/right-typer/commit/${import.meta.env.VITE_REVIEW_SHA}">${import.meta.env.VITE_REVIEW_SHA.slice(0, 7)}</a></span></footer>
    </main>`;
  const select = app.querySelector<HTMLSelectElement>('#wm-name')!;
  const thumbInput = app.querySelector<HTMLInputElement>('#wm-thumbs')!;
  const syncUrl = () => {
    params.set('name', name === 'Bright Typer' ? 'bright' : 'right');
    params.set('style', style);
    params.set('icon', icon);
    if (thumbs) params.set('thumbs', '1');
    else params.delete('thumbs');
    history.replaceState(null, '', `${location.pathname}?${params}`);
  };
  const render = () => {
    select.value = name;
    thumbInput.checked = thumbs;
    app.querySelector('#wm-chosen')!.innerHTML = wordmark(name, style, thumbs);
    app.querySelector('.wm-tab-title')!.textContent = name;
    app.querySelector<HTMLImageElement>('.wm-tab-icon')!.src = iconPath(icon, '16.png');
    app.querySelector('.wm-grid')!.innerHTML = options
      .map(
        ([id, number, title, description]) => `
      <article class="wm-card"><div class="wm-card-title"><span>${number}</span><h2>${title}</h2></div>
      <div class="wm-large">${wordmark(name, id, thumbs)}</div>
      <div class="wm-header"><span class="wm-size">22px / header</span>${wordmark(name, id, thumbs)}</div>
      <p>${description}</p><button type="button" data-style="${id}" aria-pressed="${style === id}">${style === id ? 'Showing in header' : 'Try in header'}</button></article>`,
      )
      .join('');
    const labels = name === 'Bright Typer' ? ['Br', ...'ightTyper'] : [...'RightTyper'];
    app.querySelector('.wm-map')!.innerHTML = keys
      .map(
        (key, i) =>
          `<div><span class="wm-map-key" style="background:var(--${sequence[i]})">${key}</span><span class="wm-map-letter">${labels[i]}</span></div>`,
      )
      .join('');
    app.querySelector('.wm-name-note')!.textContent =
      name === 'Bright Typer'
        ? 'Bright has eleven letters: B and r share the rose column. Both greens and both turquoises stay in place.'
        : 'R · i · g · h · t  /  T · y · p · e · r — one letter per keyboard column. The space is separate.';
    app.querySelectorAll<HTMLButtonElement>('[data-icon]').forEach((button) => {
      const active = button.dataset.icon === icon;
      button.setAttribute('aria-pressed', String(active));
      button.textContent = active ? 'Showing in tab' : 'Try in tab';
    });
    app.querySelector('#wm-icon-status')!.textContent =
      `Current tab icon: ${icons.find(([id]) => id === icon)![1]}. RT is a Right Typer candidate; changing the review text does not rename it.`;
    document.querySelectorAll('link[rel="icon"]').forEach((link) => link.remove());
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.sizes.add('32x32');
    link.href = iconPath(icon, '32.png');
    document.head.append(link);
  };
  select.addEventListener('change', () => {
    name = select.value;
    syncUrl();
    render();
  });
  thumbInput.addEventListener('change', () => {
    thumbs = thumbInput.checked;
    syncUrl();
    render();
  });
  app.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-style],button[data-icon]',
    );
    if (!target) return;
    const nextStyle = options.find(([id]) => id === target.dataset.style)?.[0];
    const nextIcon = icons.find(([id]) => id === target.dataset.icon)?.[0];
    if (nextStyle) style = nextStyle;
    if (nextIcon) icon = nextIcon;
    syncUrl();
    render();
    app
      .querySelector<HTMLButtonElement>(
        nextStyle ? `[data-style="${style}"]` : `[data-icon="${icon}"]`,
      )
      ?.focus({ preventScroll: true });
  });
  render();
}

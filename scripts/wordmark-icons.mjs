// Regenerate editable SVG masters and 16/32/48px PNG + multi-size ICO exports.
// Uses the existing keyboard CSS tokens; no font installation or raster artwork.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
const palette = Object.fromEntries(
  [...css.matchAll(/--((?:left|right)-\w+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]),
);
const columns = [
  'left-little',
  'left-ring',
  'left-middle',
  'left-index',
  'left-index',
  'right-index',
  'right-index',
  'right-middle',
  'right-ring',
  'right-little',
];
const rail = columns
  .map(
    (finger, i) => `<rect x="${6 + i * 2}" y="25" width="2" height="3" fill="${palette[finger]}"/>`,
  )
  .join('');
const rt =
  '<path d="M5 21V8h5a4 4 0 0 1 0 8H5m5 0 5 5M18 8h10m-5 0v13" fill="none" stroke="#20252b" stroke-width="2.8" stroke-linejoin="round"/>';
const designs = {
  rt: `<rect x="1" y="1" width="30" height="30" rx="5" fill="#fafafa"/>${rt}${rail}`,
  split: `<rect x="1" y="1" width="30" height="30" rx="5" fill="#fafafa"/>${['left-index', 'left-index', 'right-index', 'right-index'].map((f, i) => `<rect x="${2 + i * 7}" y="3" width="7" height="26" fill="${palette[f]}"/>`).join('')}${rt}`,
  key: `<rect x="2" y="3" width="28" height="26" rx="4" fill="#fafafa" stroke="#20252b" stroke-width="2"/><path d="M9 10h14m-7 0v11" fill="none" stroke="#20252b" stroke-width="3"/>${rail}`,
};
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [id, body] of Object.entries(designs)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img"><title>Right Typer ${id} favicon</title>${body}</svg>\n`;
  const file = (suffix) => new URL(`../public/wordmarks/${id}.${suffix}`, import.meta.url);
  await writeFile(file('svg'), svg);
  const pngs = [];
  for (const size of [16, 32, 48]) {
    const data = await page.evaluate(
      async ({ svg, size }) => {
        const image = new Image();
        image.src = 'data:image/svg+xml;base64,' + btoa(svg);
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(image, 0, 0, size, size);
        return canvas.toDataURL('image/png').split(',')[1];
      },
      { svg, size },
    );
    const png = Buffer.from(data, 'base64');
    pngs.push({ size, png });
    await writeFile(file(`${size}.png`), png);
  }
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, png }, i) => {
    const at = 6 + i * 16;
    header[at] = header[at + 1] = size;
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  await writeFile(file('ico'), Buffer.concat([header, ...pngs.map((p) => p.png)]));
}
await browser.close();
console.log('Generated 3 SVG masters, 9 PNG sizes, 3 multi-size ICOs.');

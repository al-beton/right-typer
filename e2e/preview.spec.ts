import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

let server: Server;
let origin: string;
const generated = new Map<string, Record<string, string>>();
test.beforeAll(async () => {
  for (const number of [23, 24]) {
    // Exercise the real trusted decorator against the production HTML.
    generated.set(
      String(number),
      JSON.parse(
        execFileSync(
          'python3',
          [
            '-c',
            `
import sys,json
sys.path.insert(0,'scripts/previews')
from publish import decorate
files,_=decorate({'index.html':open('dist/index.html','rb').read()},${number},'a'*40,99)
print(json.dumps({k:v.decode() for k,v in files.items()}))
`,
          ],
          { encoding: 'utf8' },
        ),
      ),
    );
  }
  const root = resolve('dist');
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url!, 'http://localhost').pathname;
    const match = /^\/previews\/pr-(23|24)\/(.*)$/.exec(pathname);
    if (!match) {
      res.writeHead(404).end();
      return;
    }
    const name = match[2] || 'index.html';
    const path = resolve(root, name);
    if (!path.startsWith(root + '/')) {
      res.writeHead(404).end();
      return;
    }
    try {
      const bytes = generated.get(match[1]!)?.[name] ?? (await readFile(path));
      res.setHeader(
        'Content-Type',
        (
          {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.wasm': 'application/wasm',
            '.css': 'text/css',
            '.svg': 'image/svg+xml',
          } as Record<string, string>
        )[extname(path)] ?? 'application/octet-stream',
      );
      res.end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test('nested preview serves real model, worker, WASM and commit banner', async ({ page }) => {
  const failures: string[] = [],
    errors: string[] = [],
    requests: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failures.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(origin + '/previews/pr-23/');
  await expect(page.getByRole('complementary', { name: 'PR preview' })).toContainText(
    'PR #23 · aaaaaaaaaaaa',
  );
  await expect(page.locator('#camera-badge')).toContainText('0 hands detected', { timeout: 45000 });
  await expect(page.locator('#requested-key')).toHaveText('Mark q in the image');
  expect(requests.some((u) => u.includes('hand_landmarker.task'))).toBe(true);
  expect(requests.some((u) => u.endsWith('.wasm'))).toBe(true);
  expect(requests.every((u) => u.startsWith(origin + '/previews/pr-23/'))).toBe(true);
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/pr-preview.png', fullPage: true });
});

test('two previews preserve separate storage across updates and resets', async ({ context }) => {
  const first = await context.newPage(),
    second = await context.newPage();
  await first.goto(origin + '/previews/pr-23/');
  await second.goto(origin + '/previews/pr-24/');
  await first.evaluate(() =>
    localStorage.setItem(
      'right-typer.v1',
      JSON.stringify({ results: [], cameraDisconnected: true, cameraRotation: 90 }),
    ),
  );
  await second.evaluate(() =>
    localStorage.setItem(
      'right-typer.v1',
      JSON.stringify({ results: [], cameraDisconnected: true, cameraRotation: 180 }),
    ),
  );
  await first.reload();
  expect(
    await first.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!).cameraRotation),
  ).toBe(90);
  expect(
    await second.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!).cameraRotation),
  ).toBe(180);
  await first.evaluate(() => localStorage.clear());
  expect(await first.evaluate(() => localStorage.getItem('right-typer.v1'))).toBeNull();
  expect(
    await second.evaluate(() => JSON.parse(localStorage.getItem('right-typer.v1')!).cameraRotation),
  ).toBe(180);
  await first.evaluate(() => {
    sessionStorage.setItem('probe', 'ordinary');
    sessionStorage.clear();
  });
  expect(await first.evaluate(() => sessionStorage.getItem('probe'))).toBeNull();
});

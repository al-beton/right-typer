import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
let server: Server;
let origin: string;
test.beforeAll(async () => {
  // A plain static server with the repository prefix, no SPA or Vite fallbacks.
  const root = resolve('dist');
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url!, 'http://localhost').pathname;
    const path = resolve(
      root,
      '.' + pathname.replace(/^\/right-typer/, '') + (pathname.endsWith('/') ? 'index.html' : ''),
    );
    if (!pathname.startsWith('/right-typer/') || !path.startsWith(root + '/')) {
      res.writeHead(404).end();
      return;
    }
    try {
      const bytes = await readFile(path);
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
test('repository subpath serves the real worker, model and WASM from the same origin', async ({
  page,
}) => {
  const failed: string[] = [],
    offOrigin: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  page.on('request', (r) => {
    if (!r.url().startsWith(origin + '/right-typer/')) offOrigin.push(r.url());
  });
  await page.goto(origin + '/right-typer/');
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await expect(page.locator('#camera-badge')).toContainText('0 hands detected', { timeout: 45000 });
  expect(failed).toEqual([]);
  expect(offOrigin).toEqual([]);
});

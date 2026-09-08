import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
const sha =
  process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Invalid build commit');
export default defineConfig({
  define: {
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(sha),
    'import.meta.env.VITE_BUILD_LABEL': JSON.stringify(
      process.env.BUILD_ENV === 'production' ? 'Production' : 'Local',
    ),
  },
  base: './',
  test: { include: ['tests/**/*.test.ts'] },
});

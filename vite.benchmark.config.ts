import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    ssr: 'scripts/benchmark/run.ts',
    outDir: '.benchmark-cli',
    copyPublicDir: false,
    rollupOptions: { output: { entryFileNames: 'benchmark.mjs' } },
  },
});

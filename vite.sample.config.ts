import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    ssr: 'scripts/sample.ts',
    outDir: '.sample-cli',
    rollupOptions: { output: { entryFileNames: 'sample.mjs' } },
  },
});

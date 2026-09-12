import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    ssr: true,
    outDir: '.sample-cli',
    rollupOptions: {
      input: { sample: 'scripts/sample.ts', 'sample-suite': 'scripts/sample-suite.ts' },
      output: { entryFileNames: '[name].mjs' },
    },
  },
});

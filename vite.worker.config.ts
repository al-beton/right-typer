import { defineConfig } from 'vite';
// MediaPipe's loader uses importScripts, so dev and production both need an IIFE worker.
export default defineConfig({
  build: {
    lib: {
      entry: 'src/tracking/worker.ts',
      name: 'RightTyperTracking',
      formats: ['iife'],
      fileName: () => 'tracking-worker.js',
    },
    outDir: 'public/tracking',
    emptyOutDir: true,
    copyPublicDir: false,
  },
});

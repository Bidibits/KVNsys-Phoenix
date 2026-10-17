import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Builds the screens. The desktop side is compiled separately, by tsc.
export default defineConfig({
  root: 'screens',
  // The window loads these files from disk, so every link must be relative.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    // One copy of React, even though KVNsysUI brings its own dependency on it.
    dedupe: ['react', 'react-dom'],
  },
  build: { outDir: '../dist/screens', emptyOutDir: true },
});

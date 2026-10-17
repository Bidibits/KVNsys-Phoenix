import { defineConfig } from 'vitest/config';

// Starting a real Electron window takes a few seconds, so these tests get more time, and run
// one file at a time so two copies of the app never compete.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});

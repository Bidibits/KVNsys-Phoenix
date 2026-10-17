import { defineConfig } from 'vitest/config';

// Starting a real Electron window takes a few seconds, so these tests get more time.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

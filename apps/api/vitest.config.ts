import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The integration tests share one database, so they run one file at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});

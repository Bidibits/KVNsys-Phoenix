import { defineConfig } from 'vitest/config';

// `pnpm check:package`: the programs `pnpm package` built, in out\, run together. Not part of
// `pnpm test`, which checks the code; this checks what the setup files carry, so it needs a
// `pnpm package` first.
export default defineConfig({
  test: {
    include: ['built/**/*.check.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

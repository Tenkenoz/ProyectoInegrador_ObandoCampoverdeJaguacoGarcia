import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.integration-spec.ts'],
    exclude: ['node_modules', 'dist'],
    hookTimeout: 30_000,
    testTimeout: 15_000,
    fileParallelism: false,
  },
});

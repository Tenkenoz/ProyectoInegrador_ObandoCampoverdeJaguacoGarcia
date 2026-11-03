import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    include: ['test/**/*.integration-spec.ts'],
    hookTimeout: 30000,
    testTimeout: 15000,
    fileParallelism: false,
  },
});

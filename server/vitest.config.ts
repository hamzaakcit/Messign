import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    /** bcrypt (cost 12) under parallel workers can exceed 5s on busy CI/agents. */
    testTimeout: 15_000,
    /** Real-Postgres suites build schemas in beforeAll; several start at once on a loaded machine or CI runner. */
    hookTimeout: 60_000,
    environment: 'node',
    globals: true,
    include: [
      'src/__tests__/agents/**/*.test.ts',
      'src/__tests__/ai/**/*.test.ts',
      'src/__tests__/dal/**/*.test.ts',
      'src/__tests__/engage/**/*.test.ts',
      'src/__tests__/migrations/**/*.test.ts',
      'src/__tests__/middleware/**/*.test.ts',
      'src/__tests__/modules/**/*.test.ts',
      'src/__tests__/services/**/*.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});

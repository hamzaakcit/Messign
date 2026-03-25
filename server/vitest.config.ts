import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/__tests__/agents/**/*.test.ts',
      'src/__tests__/dal/**/*.test.ts',
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

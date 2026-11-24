import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    /** Default 5s is tight for parallel jsdom + dynamic imports; avoids flaky CI/local runs. */
    testTimeout: 15_000,
    hookTimeout: 15_000,
    /** The default surface of every test, whatever a developer has in client/.env.local (a test that needs another stubs it). */
    env: { VITE_PRODUCT_SURFACE: 'workspace' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Use the forks pool (child_process) instead of the default threads pool.
    // The threads/tinypool worker_threads pool deadlocks (0% CPU, no output) under
    // our Node version + sandbox; forks runs reliably. Applies to `test`,
    // `test:watch`, CI, and direct `vitest` calls.
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

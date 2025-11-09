import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    mockReset: true,
    restoreMocks: true,
    setupFiles: ['vitest.setup.ts'],
    testTimeout: 20000,
    include: ['src/util/**/__tests__/*.test.ts', 'src/**/__tests__/*.test.ts', 'src/**/__tests__/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['**/__tests__/**', 'src/main.tsx', 'historical/**'],
      all: true,
    },
  },
});

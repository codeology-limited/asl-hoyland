import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    mockReset: true,
    restoreMocks: true,
    setupFiles: ['vitest.setup.ts'],
    testTimeout: 20000,
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov'],
    include: ['src/**/*.ts', 'src/**/*.tsx'],
    exclude: ['**/__tests__/**', 'src/main.tsx'],
    all: true,
  },
});

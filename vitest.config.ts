import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov', 'cobertura'],
      include: ['src/**/*.ts'],
      exclude: ['src/bin/**'],
      thresholds: {
        branches: 35,
        functions: 40,
        lines: 40,
        statements: 40,
      },
    },
  },
});

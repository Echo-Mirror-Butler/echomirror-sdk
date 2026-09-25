import { defineConfig } from 'vitest/config'

// Coverage floor is enforced via offline unit tests in tests/client.test.ts
// so that CI enforces at least 80% coverage without requiring the fixture.
export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: {
        lines: 80,
        statements: 80,
      },
    },
  },
})

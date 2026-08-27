import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: {
        lines: 60,
        statements: 60,
      },
    },
  },
})

import { defineConfig } from 'vitest/config'

// Coverage floor is set from this package's *self-skip* baseline (no
// contract-tests fixture running — see tests/contract.test.ts), which is
// what a normal `npm run coverage` in CI actually measures. Running with
// the fixture up (as contract-tests.yml does) measures substantially
// higher (~82% lines) but that's not the default CI path for this job.
export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: {
        lines: 40,
        statements: 40,
      },
    },
  },
})

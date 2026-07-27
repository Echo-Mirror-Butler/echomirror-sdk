import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Playwright owns e2e/ — keep vitest out of it. tests/integration/ is
    // included but self-skips unless STELLAR_INTEGRATION=1 is set.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
})

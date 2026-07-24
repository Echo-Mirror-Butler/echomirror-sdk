import { defineConfig } from 'vitest/config'

// Browser-target run (headless Chromium via Playwright): resolves
// `#wasm-binding` -> wasm-web/echomirror_wasm.js via package.json#imports'
// "browser" condition, and exercises the real fetch+instantiate path that
// `init()` takes in an actual browser — the thing the Node-target run
// above can't catch.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.node.test.ts'],
    browser: {
      enabled: true,
      provider: 'playwright',
      name: 'chromium',
      headless: true,
    },
    testTimeout: 15_000,
  },
})

import { defineConfig } from 'vitest/config'

// Node-target run: resolves `#wasm-binding` -> wasm-node/echomirror_wasm.cjs
// via package.json#imports' "node" condition (Vitest's default node
// environment resolves imports with Node's own condition set).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
  },
})

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// The bundler pulls @echomirror/* from node_modules (built dist output); tests
// run against the workspace sources so they never depend on build ordering.
export default defineConfig({
  resolve: {
    alias: {
      '@echomirror/core': fileURLToPath(new URL('../../packages/js/core/src/index.ts', import.meta.url)),
      '@echomirror/mood': fileURLToPath(new URL('../../packages/js/mood/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})

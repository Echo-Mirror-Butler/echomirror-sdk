import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = (name: string) => resolve(here, `../../../packages/js/${name}/src/index.ts`)

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    alias: {
      '@echomirror/core': pkg('core'),
      '@echomirror/mood': pkg('mood'),
      '@echomirror/stellar': pkg('stellar'),
      '@echomirror/react': pkg('react'),
    },
  },
})

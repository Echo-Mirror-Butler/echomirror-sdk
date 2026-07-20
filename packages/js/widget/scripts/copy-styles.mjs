import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
mkdirSync(resolve(root, 'dist'), { recursive: true })
copyFileSync(
  resolve(root, 'src/styles.css'),
  resolve(root, 'dist/styles.css'),
)
console.log('Copied src/styles.css → dist/styles.css')

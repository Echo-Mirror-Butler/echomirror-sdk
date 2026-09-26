---
"@echomirror/core": patch
"@echomirror/mood": patch
"@echomirror/react": patch
"@echomirror/social": patch
"@echomirror/stellar": patch
---

Add dual ESM and CJS builds, automated export validation, unit test suites, and package READMEs:

- Produce dual builds (dist/index.js CJS, dist/index.mjs ESM, dist/index.d.ts, and dist/index.d.mts) via tsup for core, mood, react, social, and stellar.
- Restore conditional exports (import, require, types) and validate packages with publint and @arethetypeswrong/cli.
- Add comprehensive offline unit tests with >=80% line coverage for @echomirror/core without requiring external contract test fixtures.
- Add test suites for @echomirror/mood and @echomirror/react (with @testing-library/react and jsdom) and remove --passWithNoTests.
- Add README.md documentation to @echomirror/core, @echomirror/mood, and @echomirror/react packages.

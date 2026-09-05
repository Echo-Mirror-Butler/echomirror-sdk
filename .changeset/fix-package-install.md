---
"@echomirror/core": patch
"@echomirror/mood": patch
"@echomirror/react": patch
"@echomirror/social": patch
"@echomirror/stellar": patch
---

Fix packages being unpublishable/unusable once installed from npm:

- Add a `files` allowlist so the published tarball actually includes `dist/`
  (previously excluded because it's gitignored and no `files` field existed,
  so a real `npm install` would have shipped zero compiled JS).
- Compile with `module: "commonjs"` instead of inheriting the workspace-wide
  `ESNext` setting, so the emitted `dist/index.js` is valid CommonJS matching
  what `package.json` promises via `main`/`exports.require` — previously the
  output contained raw `import`/`export` syntax that crashes immediately on
  `require()`.
- Drop the `exports.import` / `module` fields pointing at a `dist/index.mjs`
  that the build never produced.
- Pin the internal `@echomirror/core` dependency to `^0.1.0` instead of `*`.

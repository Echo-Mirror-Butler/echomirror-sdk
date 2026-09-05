# @echomirror/react

## 0.1.1

### Patch Changes

- 56fa6a4: Configure Changesets release automation and publishing path to npm.
- Updated dependencies [56fa6a4]
  - @echomirror/core@0.1.1

## 0.1.0 — 2026-08-19

### Added

- Initial release of `@echomirror/react`
- `<EchoMirrorProvider>` — top-level context provider; accepts `apiKey` and `config`
- `useEchoMirror()` — access the underlying `EchoMirrorClient` anywhere in the tree
- `useMoodStreak()` — auto-fetching hook for the current user's streak with loading / error states
- `useStellarBalance(publicKey)` — reactive hook for XLM + ECHO balance
- React 18 and React 19 compatible; peer dependency `react >= 18.0.0`

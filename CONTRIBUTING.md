# Contributing to EchoMirror SDK

Welcome — we're building an open SDK for mood, wellness, and Stellar payments. Every contribution earns points on the Stellar Wave program.

## Ways to contribute

- **New features** — pick an open issue labeled `good first issue` or `help wanted`
- **Bug fixes** — check open issues or open one if you've found something
- **Examples** — add a new example app in `examples/`
- **Documentation** — improve the README, add inline JSDoc, fix typos
- **Flutter** — expand the Dart SDK in `packages/flutter/`

## Setup

```bash
git clone https://github.com/Echo-Mirror-Butler/echomirror-sdk.git
cd echomirror-sdk

# JavaScript packages
npm install
npm run build
npm run test

# Flutter package
cd packages/flutter
flutter pub get
flutter test
```

## Package structure

Each JS package lives in `packages/js/<name>/` with:
```
src/
  index.ts        # public exports only
  *.ts            # implementation
tests/
  *.test.ts
package.json
tsconfig.json
README.md
```

The Flutter package lives in `packages/flutter/` following standard Dart conventions.

## Guidelines

- **TypeScript**: strict mode, no `any`, export types from `index.ts`
- **Dart**: follow `flutter_lints`, document public APIs with `///`
- **Tests**: every new function needs at least one test
- **No breaking changes** to existing public APIs without a major version bump
- **Commits**: use conventional commits — `feat:`, `fix:`, `docs:`, `test:`

## Opening a PR

1. Fork the repo
2. Create a branch: `git checkout -b feat/your-feature`
3. Make your changes and add tests
4. Run `npm run build && npm test` (JS) or `flutter test` (Dart)
5. Open a PR against `main` — describe what you changed and why

All PRs are reviewed within 48 hours. Contributors earn Stellar Wave points for merged PRs.

## Questions?

Open a GitHub Discussion or join the Discord at https://discord.gg/echomirror.

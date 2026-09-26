---
"@echomirror/core": patch
"@echomirror/mood": patch
"@echomirror/react": patch
"@echomirror/social": patch
"@echomirror/stellar": patch
"@echomirror/analytics": patch
---

Add the `repository` field npm requires for provenance to every publishable
`package.json` (issue #206).

npm only generates a provenance attestation for a package whose manifest
declares the GitHub repository it is published from, and none of the
`@echomirror/*` manifests did — so the release workflow could never have
produced attestations even once provenance was switched on. This is
packaging metadata only; no runtime behavior changes.

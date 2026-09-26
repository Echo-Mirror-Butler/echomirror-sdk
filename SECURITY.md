# Security Policy

> **Key custody & threat model:** before embedding this SDK, read the
> [Key Custody & Security Model](docs-site/docs/security-model.md). It audits,
> per language binding and wallet adapter, whether raw secret material ever
> enters the process and what the SDK does and does not protect against.

## Supported Versions

Only the latest published release of each SDK component receives security fixes.
Pre-release (`0.x`) and older major versions are **not** patched.

| Component | Supported |
|---|---|
| `echomirror-core` (crates.io) | ✅ latest |
| `echomirror-stellar` (crates.io) | ✅ latest |
| `echomirror-sync` (crates.io) | ✅ latest |
| `echomirror-wasm` (crates.io) | ✅ latest |
| `@echomirror/core` (npm) | ✅ latest |
| `@echomirror/mood` (npm) | ✅ latest |
| `@echomirror/stellar` (npm) | ✅ latest |
| `@echomirror/social` (npm) | ✅ latest |
| `@echomirror/analytics` (npm) | ✅ latest |
| `@echomirror/react` (npm) | ✅ latest |
| `@echomirror/wasm` (npm) | ✅ latest |
| `echomirror_sdk` (pub.dev) | ✅ latest |
| `echomirror-sdk` (PyPI) | ✅ latest |
| `EchoMirrorSDK` (Swift / SPM) | ✅ latest |
| Any `0.x` release | ❌ not supported |
| Older major releases (if any) | ❌ not supported |

`echomirror-ffi` is not listed because it is `publish = false` — it is never on
crates.io (issue #195). It ships inside the Flutter and Swift packages, which
are listed above and are the versions to report against.

## Reporting a Vulnerability

**Please do not file a public GitHub issue for security vulnerabilities.**

Use GitHub's [private vulnerability reporting](https://github.com/Echo-Mirror-Butler/echomirror-sdk/security/advisories/new)
to report a vulnerability confidentially. This is the preferred channel — it
keeps the report private until a fix is ready, lets us coordinate a disclosure
timeline with you, and lets us credit you in the published advisory.

> **How to enable private reporting on your fork:**  
> Repo Settings → Code security and analysis → Private vulnerability reporting → Enable.  
> This setting must be on for the link above to work in *your* repo.

If for some reason the GitHub advisory flow is unavailable, email
**security@echomirror.dev** with:

- A description of the vulnerability and the affected component(s)
- Reproduction steps or proof-of-concept (can be a private Gist)
- Your assessment of severity and potential impact
- Any mitigations you are aware of

**Please encrypt sensitive details** using our PGP key (key ID published in the
[GitHub advisory page](https://github.com/Echo-Mirror-Butler/echomirror-sdk/security/advisories)).

## Response Timeline

| Milestone | Target |
|---|---|
| Acknowledgement of report | ≤ 2 business days |
| Triage and severity assessment | ≤ 5 business days |
| Status update (fix in progress / won't fix / needs more info) | ≤ 10 business days |
| Fix released and advisory published | ≤ 90 days (critical: ≤ 14 days) |

We follow [coordinated disclosure](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerability_Disclosure_Cheat_Sheet.html):
we ask that you give us the response window above before publishing details
publicly. We will keep you informed throughout and credit you in the advisory
unless you prefer otherwise.

## Scope

The following are **in scope**:

- All published SDK packages listed in the Supported Versions table above
- The CI/CD pipelines in this repository (supply-chain attacks, secret leakage)
- Security-relevant logic in the Rust core: Stellar transaction signing,
  cryptographic key handling, XDR encoding/decoding

The following are **out of scope** for this policy:

- The EchoMirror backend API (report via the platform's own security channel)
- Third-party dependencies themselves — report those upstream and we will
  update our dependency once a fix is available
- Vulnerabilities in unsupported versions (see table above)
- Issues that require physical access to a user's device

## Known Dev-Tooling Advisories (Issue #199)

`npm audit` findings we've evaluated and accepted, with reasoning. None of
these packages ship in any published `@echomirror/*` artifact — they're
only present in the dev/test dependency graph.

| Package | Severity | Status | Reason |
| --- | --- | --- | --- |
| `vitest`, `@vitest/coverage-v8`, `@vitest/browser` | Critical | Fixed — bumped to `^4.1.11` | Patches the arbitrary file read via the Vitest dev/UI server. |
| `vite` | High | Fixed transitively via the `vitest` bump | `vitest@4.1.11` depends on a patched `vite`. |
| `markdown-it` | High | Fixed via `overrides: "^14.1.0"` | Patches the quadratic-complexity smartquotes rule; no direct dependents have released a fix yet. |
| `linkify-it` | High | Fixed via `overrides: "^5.0.0"` | Patches the quadratic scan loop; pulled in transitively by docs tooling. |
| `tmp` | High | Fixed via `overrides: "^0.2.5"` | Patches the arbitrary file write via a symlinked `dir` option; pulled in transitively by build tooling. |

CI runs `npm audit --audit-level=high` (see `security-audit.yml`) so a new
critical/high advisory in dev tooling surfaces on the next PR instead of
being discovered only when someone happens to run `npm audit` locally.

## Verifying a release (issue #206)

Every `@echomirror/*` package on npm is published from CI, and every publish
requests an **npm provenance attestation** — an SLSA-style statement, signed by
npm against the GitHub Actions OIDC token, that binds the published tarball to
the commit in this repository it was built from. `release.yml` turns it on with
`NPM_CONFIG_PROVENANCE: "true"` (the `id-token: write` permission it needs was
already there); `wasm-publish.yml` passes `--provenance` directly. A release
that somehow published without attestations fails in CI — see
`scripts/verify-attestations.mjs`.

Consumers can check this for themselves, without trusting this repository:

```bash
# 1. Audit the signature + provenance of every @echomirror/* package in a project
npm audit signatures

# 2. Or inspect one package's attestation directly
npm view @echomirror/core dist.attestations
```

The same attestations also show up as a **Provenance** badge on the package's
npmjs.com page, linking to the exact workflow run and commit.

Maintainers can re-run the same check at any time against whatever is currently
on the registry:

```bash
npm run check:provenance
```

> **Note on the publishing token:** releases currently authenticate with a
> long-lived automation `NPM_TOKEN` rather than npm's OIDC "trusted publishing".
> Trusted publishing is supported by npm and would let us drop that token
> entirely, but switching requires the `changesets/action` publish path to
> authenticate through OIDC, and a misconfigured trusted-publisher entry fails
> the release outright with no fallback. The trade-off is documented in
> [CONTRIBUTING.md](./CONTRIBUTING.md#releasing); until the switch is made, the
> provenance attestations above are the actual guarantee that a tarball came
> from this repository, and they are what `npm audit signatures` verifies.

## Preferred Languages

We accept reports in English or Spanish.

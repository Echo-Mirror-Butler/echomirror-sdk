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
| `echomirror-ffi` (crates.io) | ✅ latest |
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

## Package Provenance & Supply-Chain Integrity

All `@echomirror/*` npm packages published from this repository are built and released with cryptographic provenance attestations via GitHub Actions and Sigstore, meeting SLSA Build Level 2 standards.

### Verifying Signatures & Provenance

Consumers and integrators can cryptographically verify that installed packages were built and published directly by this repository's automated CI/CD workflows:

1. **Verify all project dependencies:**
   ```bash
   npm audit signatures
   ```
   This validates Sigstore signatures and transparency logs for all installed packages in `node_modules`.

2. **Inspect attestations for a specific package release:**
   ```bash
   npm view @echomirror/core dist.attestations
   ```
   Or for a specific version:
   ```bash
   npm view @echomirror/core@0.2.0 dist.attestations --json
   ```
   A verified release returns a Sigstore attestation bundle linking the published artifact to its build commit, workflow run, and repository (`Echo-Mirror-Butler/echomirror-sdk`).

### Evaluation of npm Trusted Publishing (OIDC)

We evaluated migrating from long-lived secret tokens (`NPM_TOKEN`) to npm Trusted Publishing via OpenID Connect (OIDC):

- **Benefits**:
  - Eliminates long-lived repository secrets, removing the risk of credential leakage.
  - Automatically exchanges short-lived OIDC tokens using GitHub Actions' `id-token: write` permission.
  - Establishes granular trust policies scoped to specific repository environments and workflows.

- **Monorepo Constraints & Architectural Decision**:
  - npm Trusted Publishing requires configuring trust relationships on npmjs.com on a **per-package basis**. Because npm does not currently offer organization-wide or monorepo-wide wildcard trusted publisher policies, each of our 7 publishable packages (`@echomirror/core`, `@echomirror/mood`, `@echomirror/stellar`, `@echomirror/social`, `@echomirror/analytics`, `@echomirror/react`, `@echomirror/wasm`) must be registered individually on the npm registry.
  - In addition, the Changesets release workflow (`changeset publish`) expects authentication credentials upfront; removing `NPM_TOKEN` prior to full registry configuration across all packages causes release pipeline failures with `ENEEDAUTH`.
  - **Decision**: We have enabled SLSA provenance generation via `NPM_CONFIG_PROVENANCE: "true"`, `id-token: write`, `repository.directory`, and `publishConfig.provenance: true`, while retaining `NPM_TOKEN` as the baseline authentication credential. This delivers immediate, end-to-end cryptographic provenance guarantees on all future releases without risking automated release interruptions.

- **Migration Path to Keyless OIDC**:
  Organization administrators can complete the transition to pure keyless publishing by registering each package on npmjs.com:
  1. Navigate to `https://www.npmjs.com/package/<package-name>/access`.
  2. Under **Publishing Access** → **GitHub Actions**, configure:
     - Organization / User: `Echo-Mirror-Butler`
     - Repository: `echomirror-sdk`
     - Workflow: `release.yml` (and `wasm-publish.yml` for `@echomirror/wasm`)
     - Environment: (leave blank / default)
  3. Once all publishable packages have Trusted Publishing enabled, `NPM_TOKEN` can be safely removed from repository secrets.

## Preferred Languages

We accept reports in English or Spanish.

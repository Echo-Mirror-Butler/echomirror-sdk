# Security Policy

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

## Preferred Languages

We accept reports in English or Spanish.

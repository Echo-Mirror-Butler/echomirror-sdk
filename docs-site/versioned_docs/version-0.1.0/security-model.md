# Key Custody & Security Model

> How EchoMirror SDK handles (and deliberately does **not** handle) Stellar
> secret keys across every language binding and wallet adapter. Read this
> before embedding the SDK in a browser app, a mobile app, or a backend
> service — the right choice is different in each case.

This document is the authoritative reference for **key custody** in the SDK. It
audits, per binding, whether raw secret material ever enters the process, what
guarantees each signing path provides, and what remains the integrator's
responsibility. It complements [SECURITY.md](https://github.com/Echo-Mirror-Butler/echomirror-sdk/blob/main/SECURITY.md), which covers
vulnerability reporting and supported versions.

---

## TL;DR — which path should I use?

| Your environment | Reach for | Private key ever in this process? |
|---|---|---|
| Browser web app | A **wallet adapter** (Freighter / xBull / Albedo) | **No** — the extension/popup signs |
| Browser + hardware | **Ledger** adapter | **No** — the device signs; host never sees the seed |
| Backend / server | A server-held `Keypair` from your own secret store | **Yes, briefly** — you own that risk |
| Mobile app | Wallet adapter where available; **Ledger** if your platform supports WebUSB/HID | Depends on path chosen (see below) |

**Golden rule:** never construct a `Keypair` from a secret string in
client-side / browser code. If the key exists in the browser's memory or
JavaScript, it can be exfiltrated by any exploited dependency. Use a wallet
adapter instead.

---

## The two custody models

The SDK spans two fundamentally different trust boundaries:

1. **Custodial-by-wallet (the SDK never sees the secret).** Wallet adapters
   hand an *unsigned* XDR envelope to an external signer (browser extension,
   web popup, or hardware device). The secret key lives outside the SDK
   process and is never serialized into application memory that the app can
   read.

2. **Self-custodial (the SDK/app holds the secret).** Server-side bindings
   construct a `Keypair` from a secret provided by the integrator (an env var,
   a secret manager, a KMS). The secret exists in the process for as long as
   you keep it there. The SDK signs locally.

The SDK does **not** try to hide which model you are using — every signing
entry point is explicit about it.

---

## JS / TypeScript — `@echomirror/stellar`

Source: `packages/js/stellar/src/wallets/`.

### Wallet adapters — no secret ever present

`connectWallet()` tries adapters in order (`freighter`, `xbull`, `ledger`,
`albedo`) and returns the first available one. Each adapter implements
`signTransaction(xdr) => signedXdr`; **none of them receive or return a secret
key**:

- **Freighter** (`wallets/freighter.ts`) — signs inside the Freighter browser
  extension. The SDK only passes XDR in and gets signed XDR out.
- **xBull** (`wallets/xbull.ts`) — same model, signs inside the xBull
  extension/window object.
- **Albedo** (`wallets/albedo.ts`) — signs via a hosted popup at
  `albedo.link` using a signing *intent*. Requires a browser environment;
  throws `WalletNotFoundError` outside one.
- **Ledger** (`wallets/ledger.ts`) — signs on the hardware device. See below.

> `packages/js/stellar/src/index.ts` re-exports `Keypair` from
> `@stellar/stellar-sdk`. That re-export is for **server-side** use (see the
> self-custodial section). In a browser app you should never call
> `Keypair.fromSecret(...)`.

### Ledger adapter — strongest guarantee

`wallets/ledger.ts` is the only adapter that touches cryptographic material
*at all*, and it touches only the **public** key:

- The device returns a raw public key; the adapter reconstructs a
  `Keypair.fromPublicKey(...)` purely to attach the signature *hint*.
- It computes the transaction's `signatureBase()`, sends **that hash** to the
  device, and attaches the returned raw signature back onto the XDR.
- The seed / private key **never leaves the Ledger**. The host process only
  ever holds the signature base (a hash) and the resulting signature — neither
  is sufficient to derive or reuse the private key.

This is the strongest custody guarantee the SDK offers and is the recommended
path for any environment that can reach a Ledger (desktop browsers via
WebUSB/HID, and some mobile setups).

### Self-custodial (server-side) JS

When no wallet is available (e.g. Node.js), `connectWallet()` throws and its
message explicitly says: *"sign with a Keypair secret and submit the XDR
directly."* Constructing `Keypair.fromSecret(...)` is the integrator's choice
and the integrator's risk. Keep that secret in a server-side secret manager
(not in source, not in the client bundle, not in logs).

---

## Rust — `echomirror-stellar`

Source: `crates/echomirror-stellar/src/transaction.rs`.

The Rust crate deliberately returns an **`UnsignedTransaction`** (XDR envelope)
from builders such as `build_echo_transfer`. Its own doc comment states the
envelope *"must be signed by the sender's keypair before submission"* and
suggests signing *"with `stellar_sdk::Keypair`"* in a Rust server. The crate
does **not** embed a secret store. The secret key is supplied by the calling
application and exists in that process for the duration of signing. This is the
self-custodial model — appropriate for backend services, with the secret owned
by your infrastructure.

---

## Python — `echomirror-sdk` (PyPI)

Source: `crates/echomirror-python/src/stellar.rs` (PyO3 bindings over the Rust
crate).

The Python API mirrors the Rust one: `build_echo_transfer` returns an unsigned
`xdr` string, and `submit_transaction` accepts an **already-signed** XDR
envelope. The Python layer never constructs or stores a secret. As with Rust,
server-side signing with a `Keypair` (typically from an environment variable)
is the integrator's responsibility and infrastructure to protect.

---

## Flutter / Swift / WASM bindings

These bindings currently delegate signing to the same models described above:

- Where a platform wallet or the browser `freighter`/`xbull`/Ledger flow is
  reachable, prefer the wallet-adapter path so the secret never enters the app.
- The WASM build (`@echomirror/wasm`, `echomirror-wasm` crate) and the
  `echomirror-sync` sync primitives operate on **public** data only (balances,
  transaction history, mood logs) and do not require a secret to read.
- For mobile (Flutter/Swift), confirm whether your target platform exposes a
  wallet or Ledger transport before assuming the no-secret path is available.
  If it is not, you fall back to the self-custodial model and must protect the
  secret within the mobile app's secure storage (Keychain/Keystore), never in
  plaintext preferences.

---

## What this SDK does **NOT** protect against

Being explicit about the boundary so integrators don't assume more coverage
than exists:

- **Secret storage.** If you construct a `Keypair` from a secret (server-side
  Python/Rust/Node, or a mobile fallback), the SDK does **not** manage that
  secret for you. Use your platform's secret manager / KMS / Keychain. The SDK
  will not encrypt, rotate, or wipe it.
- **Key exfiltration in the browser.** If you put a secret in client-side
  code, the SDK cannot prevent a malicious dependency or XSS from reading it.
  The only real mitigation is to not have the secret in the client at all —
  use a wallet adapter.
- **Transaction authorization / intent.** The SDK signs exactly the XDR you
  hand it. It does not second-guess amounts, destinations, or memo fields.
  Validate transaction parameters in your app before signing.
- **Transport security.** Network calls (Horizon, Friendbot, the EchoMirror
  API) rely on TLS like any HTTPS client; the SDK adds no additional channel
  security beyond what the platform provides.
- **Malicious wallet / compromised device.** A compromised extension or a
  tampered Ledger supply chain can sign arbitrary XDR. The SDK trusts the
  signer you selected; choose and verify it carefully.

---

## Recommended pattern by use case

**Browser app**
1. Call `connectWallet()` and use the returned adapter.
2. Never call `Keypair.fromSecret` in frontend code.
3. If you must fall back to a secret (not recommended), do it in a backend
   service and have the browser call that service.

**Backend service**
1. Load the secret from your secret manager into a server-side `Keypair`.
2. Build unsigned XDR with the SDK, sign locally, submit.
3. Keep the secret out of logs, crash reports, and source control.

**Mobile app**
1. Prefer a platform wallet or the Ledger adapter if your platform supports
   the transport.
2. If neither is available, store the secret in OS secure storage
   (Keychain/Keystore), never in plaintext.
3. Treat the device as a self-custodial environment and minimize how long the
   key is resident in memory.

**Hardware-preferring / high-assurance**
1. Use the **Ledger** adapter. The seed never leaves the device; the SDK only
   ever sees a signature base hash and the resulting signature.

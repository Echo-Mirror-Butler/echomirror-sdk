# @echomirror/stellar

Production-ready Stellar integration for the EchoMirror SDK: multi-wallet
support (Freighter, xBull, Albedo), a full transaction builder (payments,
trustlines, path payments, fee-bumps), a typed error taxonomy, and automatic
retry with backoff for transient Horizon failures.

```bash
npm install @echomirror/stellar
```

## Quickstart

```ts
import { StellarClient, connectWallet } from '@echomirror/stellar'

const stellar = new StellarClient({ network: 'testnet' })

// Auto-detects Freighter → xBull → Albedo, with install guidance if none exist
const { adapter, connection } = await connectWallet({ network: 'testnet' })

const tx = await stellar.buildPaymentTransaction({
  source: connection.publicKey,
  destination: 'G…',
  amount: '12.5',
  memo: 'thanks! ✨',
})

// Wallet signs (popup/extension), SDK submits with retry on transient failures
const result = await stellar.signAndSubmit(adapter, tx)
console.log('on-chain:', result.hash)
```

Server-side (Node) there is no wallet — sign with a `Keypair`:

```ts
import { Keypair, StellarClient } from '@echomirror/stellar'

const stellar = new StellarClient({ network: 'testnet' })
const tx = await stellar.buildPaymentTransaction({ source: kp.publicKey(), destination, amount: '5' })
tx.sign(kp)
await stellar.submitTransaction(tx)
```

## Which wallet method for which use case?

| Use case | Call | Notes |
| --- | --- | --- |
| "Connect wallet" button, no preference | `connectWallet()` | Tries Freighter → xBull → Albedo; Albedo works in any browser (popup), so it is the universal fallback |
| Let the user pick a wallet | `detectWallets()` → render list → `adapter.connect()` | Only returns wallets usable right now |
| Force one specific wallet | `getWalletAdapter('freighter' \| 'xbull' \| 'albedo')` | Throws typed `WalletNotFoundError` (with install URL) if unavailable |
| Sign a transaction you built | `stellar.signAndSubmit(adapter, tx)` | Or `adapter.signTransaction(xdr, { networkPassphrase })` if you submit yourself |
| Detect which network the user's wallet is on | `adapter.connect()` → `connection.network` | Only Freighter exposes its own network selection; xBull/Albedo use the network you pass to `connectWallet`/the adapter constructor |
| No browser (Node/server) | none — sign with `Keypair`, then `stellar.submitTransaction(signedXdr)` | `connectWallet()` throws a `WalletNotFoundError` explaining this |
| Legacy EchoMirror API flows (ECHO token) | `sendEcho`, `getBalance`, … | Unchanged signatures; `sendEcho` now signs with any available wallet, not just Freighter |

## Which transaction builder for which use case?

| Use case | Call |
| --- | --- |
| Send XLM or an issued asset | `buildPaymentTransaction({ source, destination, amount, asset? })` |
| Send XLM to a brand-new (unfunded) account | `buildPaymentTransaction({ …, createDestination: true })` — becomes a `createAccount` op |
| Let an account hold a new asset | `buildTrustlineTransaction({ source, asset, limit? })` |
| Gift asset B while paying in asset A (exact spend) | `buildPathPaymentStrictSend({ sendAsset, sendAmount, destAsset, … })` |
| Deliver an exact amount of asset B (capped spend) | `buildPathPaymentStrictReceive({ sendAsset, destAsset, destAmount, … })` |
| Quote a conversion before committing | `findPaymentPath({ type, … })` |
| Sponsor someone else's transaction fee | `buildFeeBumpTransaction({ feeSource, innerTransaction })` |

Path payments quote Horizon automatically when you omit `path`/`destMin`/`sendMax`
and protect you with a slippage bound (`slippageBps`, default 0.5%).

By default builders **preflight**: they check the destination exists, the
trustline is in place, and the source's *spendable* XLM (balance minus base
reserve and liabilities) covers the amount — so users never sign a doomed
transaction. Pass `preflight: false` to skip the extra Horizon calls.

## Error taxonomy

Every failure throws a `StellarSdkError` subclass with a machine-readable
`code` and an actionable message. `error.retryable` tells you if resubmitting
can ever succeed:

| Code | Class | Retryable | Typical cause |
| --- | --- | --- | --- |
| `WALLET_NOT_FOUND` | `WalletNotFoundError` | no | Extension not installed / Node environment |
| `WALLET_USER_REJECTED` | `WalletUserRejectedError` | no | User dismissed the wallet popup |
| `WALLET_CONNECTION_FAILED` | `WalletConnectionError` | no | Any other wallet failure |
| `ACCOUNT_NOT_FOUND` / `DESTINATION_NOT_FOUND` | `AccountNotFoundError` | no | Account not funded on this network |
| `INSUFFICIENT_BALANCE` | `InsufficientBalanceError` | no | `op_underfunded`, `op_low_reserve`, fee > balance |
| `TRUSTLINE_MISSING` | `TrustlineMissingError` | no | `op_no_trust`, `op_src_no_trust`, `op_no_issuer` |
| `TRUSTLINE_LIMIT_EXCEEDED` | `TrustlineLimitExceededError` | no | `op_line_full` |
| `PATH_NOT_FOUND` | `PathNotFoundError` | no | No liquidity / price moved beyond slippage |
| `TX_BAD_SEQUENCE` | `BadSequenceError` | no — rebuild | Stale sequence number |
| `TX_EXPIRED` | `TransactionExpiredError` | no — rebuild | Time bounds passed |
| `TX_INSUFFICIENT_FEE` | `InsufficientFeeError` | no — rebuild or fee-bump | Surge pricing |
| `TX_MALFORMED` | `TransactionMalformedError` | no | Bad envelope / signatures / inputs |
| `TX_FAILED` | `TransactionFailedError` | no | Any other operation failure (codes attached) |
| `NETWORK_TIMEOUT` | `HorizonTimeoutError` | **yes** | Horizon 504 — identical resubmit is hash-idempotent |
| `RATE_LIMITED` | `HorizonRateLimitError` | **yes** | Horizon 429 (honours `Retry-After`) |
| `HORIZON_UNAVAILABLE` | `HorizonUnavailableError` | **yes** | 5xx / network unreachable |

`submitTransaction` retries **only** the retryable class automatically
(full-jitter exponential backoff, 3 retries by default — tune via
`new StellarClient({ retry: { … } })`). Permanent failures are never retried:
resubmitting a `tx_bad_seq` or `op_underfunded` envelope cannot succeed.
Resubmitting after a timeout is safe because Horizon dedupes by transaction
hash and returns the original result.

## Testing

```bash
npm test                    # unit tests, offline, mocked Horizon/wallets
npm run test:integration    # live Stellar testnet: Friendbot-funded accounts,
                            # every tx type, on-chain assertions, real error mapping
npm run test:e2e            # real Freighter extension in Chromium via Playwright:
                            # onboarding → testnet → connect popup → sign popup →
                            # payment asserted on-chain
```

The e2e run downloads the Freighter extension from the Chrome Web Store on
first use (`node e2e/scripts/fetch-freighter.mjs`) and drives its actual UI.
Selectors live in one place (`e2e/helpers.ts`) and are pinned to Freighter's
`data-testid`s. CI runs all three suites — see
`.github/workflows/stellar.yml`.

> Note: modern Freighter does **not** inject `window.freighterApi` — pages
> must use `@stellar/freighter-api` (postMessage). The `FreighterAdapter`
> handles both, preferring an injected global when present (old versions,
> tests) and falling back to the npm package (real browsers today).

// ─── Wallets ──────────────────────────────────────────────────────────────────
export {
  AlbedoAdapter,
  FreighterAdapter,
  XBullAdapter,
  connectWallet,
  detectWallets,
  getWalletAdapter,
  getWalletAdapters,
} from './wallets'
export type {
  ConnectWalletOptions,
  WalletOptions,
} from './wallets'
export type { SignOptions, WalletAdapter, WalletConnection, WalletId } from './wallets/types'

// ─── Client & transaction builders ────────────────────────────────────────────
export { StellarClient, toAsset } from './client'
export type {
  AssetSpec,
  FeeBumpOptions,
  PathPaymentStrictReceiveOptions,
  PathPaymentStrictSendOptions,
  PaymentOptions,
  PaymentPathQuote,
  StellarClientConfig,
  TrustlineOptions,
} from './client'

// ─── Networks ─────────────────────────────────────────────────────────────────
export { NETWORKS, networkFromPassphrase } from './networks'
export type { StellarNetworkConfig, StellarNetworkId } from './networks'

// ─── Errors ───────────────────────────────────────────────────────────────────
export {
  AccountNotFoundError,
  BadSequenceError,
  HorizonRateLimitError,
  HorizonTimeoutError,
  HorizonUnavailableError,
  InsufficientBalanceError,
  InsufficientFeeError,
  PathNotFoundError,
  StellarSdkError,
  TransactionExpiredError,
  TransactionFailedError,
  TransactionMalformedError,
  TrustlineLimitExceededError,
  TrustlineMissingError,
  WalletConnectionError,
  WalletNotFoundError,
  WalletUserRejectedError,
  mapHorizonError,
  mapWalletError,
} from './errors'
export type { StellarErrorCode } from './errors'

// ─── Retry ────────────────────────────────────────────────────────────────────
export { isRetryableError, withRetry } from './retry'
export type { RetryOptions } from './retry'

// ─── Amounts ──────────────────────────────────────────────────────────────────
export { fromStroops, normalizeAmount, toStroops } from './amounts'

// ─── Re-exports from @stellar/stellar-sdk for server-side signing ─────────────
export { Asset, FeeBumpTransaction, Keypair, Memo, Transaction, TransactionBuilder } from '@stellar/stellar-sdk'

// ─── EchoMirror API helpers (backwards-compatible surface) ────────────────────
export {
  connectFreighter,
  fundTestnetAccount,
  getBalance,
  getTransactionHistory,
  sendEcho,
  signWithFreighter,
  submitTransaction,
} from './echomirror'
export type { FreighterConnection } from './echomirror'
export type { StellarBalance, StellarTransaction, EchoTransfer } from './echomirror'

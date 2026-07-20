import type { WalletId } from './wallets/types'

/**
 * Machine-readable error codes for every failure mode in @echomirror/stellar.
 * Branch on `error.code` (or use `instanceof`) instead of parsing messages.
 */
export type StellarErrorCode =
  // Wallet errors
  | 'WALLET_NOT_FOUND'
  | 'WALLET_USER_REJECTED'
  | 'WALLET_CONNECTION_FAILED'
  // Account / balance errors
  | 'ACCOUNT_NOT_FOUND'
  | 'DESTINATION_NOT_FOUND'
  | 'INSUFFICIENT_BALANCE'
  | 'TRUSTLINE_MISSING'
  | 'TRUSTLINE_LIMIT_EXCEEDED'
  // Path payment errors
  | 'PATH_NOT_FOUND'
  // Transaction errors
  | 'TX_MALFORMED'
  | 'TX_BAD_SEQUENCE'
  | 'TX_EXPIRED'
  | 'TX_INSUFFICIENT_FEE'
  | 'TX_FAILED'
  // Horizon / network errors
  | 'NETWORK_TIMEOUT'
  | 'RATE_LIMITED'
  | 'HORIZON_UNAVAILABLE'

/**
 * Base class for all errors thrown by @echomirror/stellar.
 *
 * `retryable` tells you whether resubmitting the *same* operation can succeed:
 * transient Horizon failures (timeout, 429, 5xx) are retryable; permanent
 * transaction failures (bad sequence, underfunded, missing trustline…) are not
 * and must never be blindly retried.
 */
export class StellarSdkError extends Error {
  readonly code: StellarErrorCode
  readonly retryable: boolean
  /** Raw Horizon result codes, when the error came from a failed submission. */
  readonly resultCodes?: { transaction?: string; operations?: string[] }

  constructor(
    message: string,
    options: {
      code: StellarErrorCode
      retryable?: boolean
      resultCodes?: { transaction?: string; operations?: string[] }
      cause?: unknown
    },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'StellarSdkError'
    this.code = options.code
    this.retryable = options.retryable ?? false
    this.resultCodes = options.resultCodes
  }
}

// ─── Wallet errors ────────────────────────────────────────────────────────────

export class WalletNotFoundError extends StellarSdkError {
  constructor(message: string, readonly walletId?: WalletId) {
    super(message, { code: 'WALLET_NOT_FOUND' })
    this.name = 'WalletNotFoundError'
  }
}

export class WalletUserRejectedError extends StellarSdkError {
  constructor(readonly walletId: WalletId, action: 'connect' | 'sign' = 'sign') {
    super(
      action === 'connect'
        ? `The user declined the ${walletId} connection request. No funds were moved — ask the user to approve the connection and try again.`
        : `The user rejected the transaction in ${walletId}. No funds were moved.`,
      { code: 'WALLET_USER_REJECTED' },
    )
    this.name = 'WalletUserRejectedError'
  }
}

export class WalletConnectionError extends StellarSdkError {
  constructor(readonly walletId: WalletId, message: string, cause?: unknown) {
    super(`${walletId}: ${message}`, { code: 'WALLET_CONNECTION_FAILED', cause })
    this.name = 'WalletConnectionError'
  }
}

// ─── Account / balance errors ─────────────────────────────────────────────────

export class AccountNotFoundError extends StellarSdkError {
  constructor(readonly accountId: string, role: 'source' | 'destination' = 'source') {
    super(
      role === 'destination'
        ? `Destination account ${accountId} does not exist on this network. Fund it with at least 1 XLM first (a createAccount operation, or Friendbot on testnet), or pass createDestination: true when sending native XLM.`
        : `Account ${accountId} does not exist on this network. It must be funded with XLM before it can transact.`,
      { code: role === 'destination' ? 'DESTINATION_NOT_FOUND' : 'ACCOUNT_NOT_FOUND' },
    )
    this.name = 'AccountNotFoundError'
  }
}

export class InsufficientBalanceError extends StellarSdkError {
  constructor(message: string, resultCodes?: { transaction?: string; operations?: string[] }) {
    super(message, { code: 'INSUFFICIENT_BALANCE', resultCodes })
    this.name = 'InsufficientBalanceError'
  }
}

export class TrustlineMissingError extends StellarSdkError {
  constructor(message: string, resultCodes?: { transaction?: string; operations?: string[] }) {
    super(message, { code: 'TRUSTLINE_MISSING', resultCodes })
    this.name = 'TrustlineMissingError'
  }
}

export class TrustlineLimitExceededError extends StellarSdkError {
  constructor(message: string, resultCodes?: { transaction?: string; operations?: string[] }) {
    super(message, { code: 'TRUSTLINE_LIMIT_EXCEEDED', resultCodes })
    this.name = 'TrustlineLimitExceededError'
  }
}

// ─── Path payment errors ──────────────────────────────────────────────────────

export class PathNotFoundError extends StellarSdkError {
  constructor(message: string, resultCodes?: { transaction?: string; operations?: string[] }) {
    super(message, { code: 'PATH_NOT_FOUND', resultCodes })
    this.name = 'PathNotFoundError'
  }
}

// ─── Transaction errors ───────────────────────────────────────────────────────

export class TransactionMalformedError extends StellarSdkError {
  constructor(message: string, resultCodes?: { transaction?: string; operations?: string[] }) {
    super(message, { code: 'TX_MALFORMED', resultCodes })
    this.name = 'TransactionMalformedError'
  }
}

export class BadSequenceError extends StellarSdkError {
  constructor(resultCodes?: { transaction?: string; operations?: string[] }) {
    super(
      'Transaction sequence number is stale (tx_bad_seq). Another transaction was likely submitted from this account in the meantime. Rebuild the transaction from a freshly loaded account and sign it again — do not resubmit the old envelope.',
      { code: 'TX_BAD_SEQUENCE', resultCodes },
    )
    this.name = 'BadSequenceError'
  }
}

export class TransactionExpiredError extends StellarSdkError {
  constructor(resultCodes?: { transaction?: string; operations?: string[] }) {
    super(
      'Transaction time bounds have expired (tx_too_late). Rebuild and re-sign the transaction — the signed envelope is permanently invalid.',
      { code: 'TX_EXPIRED', resultCodes },
    )
    this.name = 'TransactionExpiredError'
  }
}

export class InsufficientFeeError extends StellarSdkError {
  constructor(resultCodes?: { transaction?: string; operations?: string[] }) {
    super(
      'Transaction fee is below the current network minimum (tx_insufficient_fee) — the network is likely under surge pricing. Rebuild with a higher base fee, or wrap the signed transaction in a fee-bump transaction via buildFeeBumpTransaction().',
      { code: 'TX_INSUFFICIENT_FEE', resultCodes },
    )
    this.name = 'InsufficientFeeError'
  }
}

export class TransactionFailedError extends StellarSdkError {
  constructor(message: string, resultCodes?: { transaction?: string; operations?: string[] }) {
    super(message, { code: 'TX_FAILED', resultCodes })
    this.name = 'TransactionFailedError'
  }
}

// ─── Horizon / network errors (transient — retryable) ─────────────────────────

export class HorizonTimeoutError extends StellarSdkError {
  constructor(message = 'Horizon timed out (504). The transaction may still be included in a ledger — resubmitting the identical signed envelope is safe (same hash) and will be retried automatically.') {
    super(message, { code: 'NETWORK_TIMEOUT', retryable: true })
    this.name = 'HorizonTimeoutError'
  }
}

export class HorizonRateLimitError extends StellarSdkError {
  constructor(readonly retryAfterSeconds: number) {
    super(`Horizon rate limit exceeded (429). Retry after ${retryAfterSeconds}s.`, {
      code: 'RATE_LIMITED',
      retryable: true,
    })
    this.name = 'HorizonRateLimitError'
  }
}

export class HorizonUnavailableError extends StellarSdkError {
  constructor(message: string, cause?: unknown) {
    super(message, { code: 'HORIZON_UNAVAILABLE', retryable: true, cause })
    this.name = 'HorizonUnavailableError'
  }
}

// ─── Horizon error mapping ────────────────────────────────────────────────────

interface HorizonProblem {
  status?: number
  title?: string
  extras?: {
    result_codes?: { transaction?: string; operations?: string[] }
  }
}

/**
 * Extract the Horizon problem+json body from a stellar-sdk error, if present.
 * Two shapes exist in the wild: `submitTransaction` throws the raw HTTP error
 * with the problem doc nested under `response.data`, while call-builder errors
 * (loadAccount, paths, transactions…) put the problem doc directly on
 * `response`.
 */
function horizonProblem(err: unknown): HorizonProblem | undefined {
  const e = err as { response?: { status?: number; data?: HorizonProblem } & HorizonProblem }
  const response = e && typeof e === 'object' ? e.response : undefined
  if (!response || typeof response !== 'object') return undefined
  if (response.data && typeof response.data === 'object') {
    return { ...response.data, status: response.status ?? response.data.status }
  }
  if (typeof response.status === 'number') return response
  return undefined
}

const OP_ERROR_MAP: Record<string, (codes: { transaction?: string; operations?: string[] }) => StellarSdkError> = {
  op_underfunded: (c) =>
    new InsufficientBalanceError(
      'The source account does not hold enough of the asset to make this payment (op_underfunded). Remember that XLM balances must also cover the base reserve and open offers/liabilities.',
      c,
    ),
  op_low_reserve: (c) =>
    new InsufficientBalanceError(
      'The operation would drop an account below the minimum XLM reserve (op_low_reserve). Each account needs a base reserve of 1 XLM plus 0.5 XLM per trustline/offer/signer.',
      c,
    ),
  op_no_destination: (c) =>
    new StellarSdkError(
      'The destination account does not exist on this network (op_no_destination). Fund it with at least 1 XLM first, or pass createDestination: true when sending native XLM.',
      { code: 'DESTINATION_NOT_FOUND', resultCodes: c },
    ),
  op_no_trust: (c) =>
    new TrustlineMissingError(
      'The destination account has no trustline for this asset (op_no_trust). The recipient must submit a changeTrust operation first — use buildTrustlineTransaction() on their side.',
      c,
    ),
  op_src_no_trust: (c) =>
    new TrustlineMissingError(
      'The source account has no trustline for the asset it is trying to send (op_src_no_trust). Create it with buildTrustlineTransaction() first.',
      c,
    ),
  op_no_issuer: (c) =>
    new TrustlineMissingError(
      'The asset issuer account does not exist on this network (op_no_issuer). Double-check the asset code and issuer address, and that you are on the intended network.',
      c,
    ),
  op_line_full: (c) =>
    new TrustlineLimitExceededError(
      'The destination trustline cannot hold this much of the asset (op_line_full). The recipient must raise their trustline limit.',
      c,
    ),
  op_too_few_offers: (c) =>
    new PathNotFoundError(
      'No conversion path with enough liquidity exists between the two assets (op_too_few_offers). Try a smaller amount, or look up viable paths with findPaymentPath().',
      c,
    ),
  op_over_source_max: (c) =>
    new PathNotFoundError(
      'Converting along the chosen path would cost more than your sendMax (op_over_source_max). The price moved — raise sendMax or re-quote the path.',
      c,
    ),
  op_under_dest_min: (c) =>
    new PathNotFoundError(
      'Converting along the chosen path would deliver less than your destMin (op_under_dest_min). The price moved — lower destMin or re-quote the path.',
      c,
    ),
}

function mapOperationCodes(codes: { transaction?: string; operations?: string[] }): StellarSdkError | undefined {
  for (const op of codes.operations ?? []) {
    const factory = OP_ERROR_MAP[op]
    if (factory) return factory(codes)
  }
  return undefined
}

/**
 * Map any error thrown while talking to Horizon (account loads, path finding,
 * transaction submission) to a typed {@link StellarSdkError}.
 *
 * Transient failures come back with `retryable: true`; permanent transaction
 * failures come back with `retryable: false` and must not be resubmitted.
 */
export function mapHorizonError(err: unknown): StellarSdkError {
  if (err instanceof StellarSdkError) return err

  const problem = horizonProblem(err)
  const status = problem?.status

  // Transient HTTP-level failures → retryable
  if (status === 504) return new HorizonTimeoutError()
  if (status === 429) {
    const retryAfter = (err as { response?: { headers?: Record<string, string> } })?.response?.headers?.['retry-after']
    return new HorizonRateLimitError(retryAfter ? parseInt(retryAfter, 10) || 10 : 10)
  }
  if (status !== undefined && status >= 500) {
    return new HorizonUnavailableError(`Horizon returned ${status} (${problem?.title ?? 'server error'}). This is transient — retrying.`, err)
  }

  // Permanent transaction failures → typed, non-retryable
  const codes = problem?.extras?.result_codes
  if (codes) {
    switch (codes.transaction) {
      case 'tx_bad_seq':
        return new BadSequenceError(codes)
      case 'tx_too_late':
        return new TransactionExpiredError(codes)
      case 'tx_too_early':
        return new TransactionFailedError('Transaction submitted before its lower time bound (tx_too_early).', codes)
      case 'tx_insufficient_fee':
        return new InsufficientFeeError(codes)
      case 'tx_insufficient_balance':
        return new InsufficientBalanceError(
          'The source account cannot cover the transaction fee on top of its reserve (tx_insufficient_balance).',
          codes,
        )
      case 'tx_malformed':
      case 'tx_bad_auth':
      case 'tx_bad_auth_extra':
      case 'tx_missing_operation':
        return new TransactionMalformedError(
          codes.transaction === 'tx_bad_auth' || codes.transaction === 'tx_bad_auth_extra'
            ? `Transaction signatures are wrong or insufficient (${codes.transaction}). Make sure the envelope was signed by the source account for the network it targets.`
            : `The transaction envelope is malformed (${codes.transaction}).`,
          codes,
        )
      case 'tx_failed': {
        const opError = mapOperationCodes(codes)
        if (opError) return opError
        return new TransactionFailedError(
          `Transaction failed with operation codes: ${(codes.operations ?? []).join(', ') || 'unknown'}.`,
          codes,
        )
      }
      default: {
        const opError = mapOperationCodes(codes)
        if (opError) return opError
        return new TransactionFailedError(
          `Transaction failed (${codes.transaction ?? 'unknown'}${codes.operations?.length ? `: ${codes.operations.join(', ')}` : ''}).`,
          codes,
        )
      }
    }
  }

  // 404 without result codes → account not found (from loadAccount etc.)
  if (status === 404) {
    return new StellarSdkError('Resource not found on Horizon (404).', { code: 'ACCOUNT_NOT_FOUND' })
  }
  if (status === 400) {
    return new TransactionMalformedError(`Horizon rejected the request as malformed (400 ${problem?.title ?? ''}).`.trim() + '.')
  }

  // No HTTP response at all → network-level failure → retryable
  const message = err instanceof Error ? err.message : String(err)
  if (/timeout|timed out|abort/i.test(message)) {
    return new HorizonTimeoutError(`Request to Horizon timed out: ${message}`)
  }
  return new HorizonUnavailableError(`Could not reach Horizon: ${message}`, err)
}

/**
 * Map an error thrown by a wallet extension/popup into a typed SDK error.
 * User rejections are detected across all three wallets' error shapes.
 */
export function mapWalletError(walletId: WalletId, err: unknown, action: 'connect' | 'sign' = 'sign'): StellarSdkError {
  if (err instanceof StellarSdkError) return err

  // Albedo rejections carry a numeric code: -4 = "Action rejected by user"
  const code = (err as { code?: number })?.code
  if (code === -4) return new WalletUserRejectedError(walletId, action)

  const message =
    err instanceof Error ? err.message
    : typeof err === 'string' ? err
    : (err as { message?: string })?.message ?? JSON.stringify(err)

  if (/reject|declin|denied|cancel|dismiss/i.test(message)) {
    return new WalletUserRejectedError(walletId, action)
  }
  return new WalletConnectionError(walletId, message || `Unknown ${walletId} error`, err)
}

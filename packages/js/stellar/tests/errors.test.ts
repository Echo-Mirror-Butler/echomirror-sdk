import { describe, expect, it } from 'vitest'
import {
  AccountNotFoundError,
  BadSequenceError,
  HorizonRateLimitError,
  HorizonTimeoutError,
  HorizonUnavailableError,
  InsufficientBalanceError,
  InsufficientFeeError,
  PathNotFoundError,
  TransactionExpiredError,
  TransactionMalformedError,
  TrustlineMissingError,
  WalletConnectionError,
  WalletUserRejectedError,
  mapHorizonError,
  mapWalletError,
} from '../src/errors'

/** Fake the axios-style error shape stellar-sdk attaches Horizon responses to. */
function horizonError(status: number, resultCodes?: { transaction?: string; operations?: string[] }, headers?: Record<string, string>) {
  return {
    response: {
      status,
      headers,
      data: {
        status,
        title: 'Transaction Failed',
        extras: resultCodes ? { result_codes: resultCodes } : undefined,
      },
    },
  }
}

describe('mapHorizonError', () => {
  it('maps 504 to a retryable timeout', () => {
    const err = mapHorizonError(horizonError(504))
    expect(err).toBeInstanceOf(HorizonTimeoutError)
    expect(err.retryable).toBe(true)
  })

  it('maps 429 to a retryable rate limit honouring retry-after', () => {
    const err = mapHorizonError(horizonError(429, undefined, { 'retry-after': '17' }))
    expect(err).toBeInstanceOf(HorizonRateLimitError)
    expect((err as HorizonRateLimitError).retryAfterSeconds).toBe(17)
    expect(err.retryable).toBe(true)
  })

  it('maps 5xx to retryable unavailability', () => {
    const err = mapHorizonError(horizonError(503))
    expect(err).toBeInstanceOf(HorizonUnavailableError)
    expect(err.retryable).toBe(true)
  })

  it('maps fetch-level failures to retryable unavailability', () => {
    const err = mapHorizonError(new TypeError('fetch failed'))
    expect(err).toBeInstanceOf(HorizonUnavailableError)
    expect(err.retryable).toBe(true)
  })

  it.each([
    ['tx_bad_seq', BadSequenceError],
    ['tx_too_late', TransactionExpiredError],
    ['tx_insufficient_fee', InsufficientFeeError],
    ['tx_insufficient_balance', InsufficientBalanceError],
    ['tx_malformed', TransactionMalformedError],
    ['tx_bad_auth', TransactionMalformedError],
  ])('maps %s to a permanent typed error', (code, cls) => {
    const err = mapHorizonError(horizonError(400, { transaction: code }))
    expect(err).toBeInstanceOf(cls)
    expect(err.retryable).toBe(false)
  })

  it.each([
    ['op_underfunded', InsufficientBalanceError],
    ['op_low_reserve', InsufficientBalanceError],
    ['op_no_trust', TrustlineMissingError],
    ['op_src_no_trust', TrustlineMissingError],
    ['op_no_issuer', TrustlineMissingError],
    ['op_too_few_offers', PathNotFoundError],
    ['op_over_source_max', PathNotFoundError],
    ['op_under_dest_min', PathNotFoundError],
  ])('maps tx_failed + %s to a permanent typed error', (op, cls) => {
    const err = mapHorizonError(horizonError(400, { transaction: 'tx_failed', operations: [op] }))
    expect(err).toBeInstanceOf(cls)
    expect(err.retryable).toBe(false)
    expect(err.resultCodes?.operations).toContain(op)
  })

  it('maps op_no_destination to DESTINATION_NOT_FOUND with actionable message', () => {
    const err = mapHorizonError(horizonError(400, { transaction: 'tx_failed', operations: ['op_no_destination'] }))
    expect(err.code).toBe('DESTINATION_NOT_FOUND')
    expect(err.message).toMatch(/createDestination/)
    expect(err.retryable).toBe(false)
  })

  it('keeps unknown operation codes in a generic non-retryable failure', () => {
    const err = mapHorizonError(horizonError(400, { transaction: 'tx_failed', operations: ['op_cross_self'] }))
    expect(err.code).toBe('TX_FAILED')
    expect(err.message).toContain('op_cross_self')
    expect(err.retryable).toBe(false)
  })

  it('maps call-builder errors, whose problem doc sits directly on response', () => {
    // stellar-sdk NotFoundError (loadAccount, paths, …) has no response.data:
    const err = mapHorizonError({
      response: { type: 'https://stellar.org/horizon-errors/not_found', title: 'Resource Missing', status: 404, detail: '…' },
    })
    expect(err.code).toBe('ACCOUNT_NOT_FOUND')
    expect(err.retryable).toBe(false)

    const transient = mapHorizonError({
      response: { title: 'Internal Server Error', status: 500, detail: '…' },
    })
    expect(transient.retryable).toBe(true)
  })

  it('passes through errors that are already typed', () => {
    const original = new AccountNotFoundError('GABC', 'destination')
    expect(mapHorizonError(original)).toBe(original)
  })
})

describe('mapWalletError', () => {
  it('detects Albedo rejection by numeric code -4', () => {
    const err = mapWalletError('albedo', { code: -4, message: 'Action rejected by user' })
    expect(err).toBeInstanceOf(WalletUserRejectedError)
  })

  it.each([
    'User declined access',
    'The user rejected this transaction',
    'Request was denied',
    'cancelled by user',
  ])('detects rejection message "%s"', (message) => {
    const err = mapWalletError('freighter', new Error(message))
    expect(err).toBeInstanceOf(WalletUserRejectedError)
  })

  it('detects rejections thrown as bare strings (xBull style)', () => {
    const err = mapWalletError('xbull', 'Connection denied')
    expect(err).toBeInstanceOf(WalletUserRejectedError)
  })

  it('wraps everything else in WalletConnectionError', () => {
    const err = mapWalletError('freighter', new Error('extension context invalidated'))
    expect(err).toBeInstanceOf(WalletConnectionError)
    expect(err.message).toContain('freighter')
  })
})

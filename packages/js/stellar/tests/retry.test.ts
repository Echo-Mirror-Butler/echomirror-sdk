import { describe, expect, it, vi } from 'vitest'
import { BadSequenceError, HorizonUnavailableError } from '../src/errors'
import { isRetryableError, withRetry } from '../src/retry'

const fastRetry = { baseDelayMs: 1, maxDelayMs: 2 }

describe('withRetry', () => {
  it('retries transient errors and eventually succeeds', async () => {
    let calls = 0
    const result = await withRetry(async () => {
      calls++
      if (calls < 3) throw new HorizonUnavailableError('Horizon 503')
      return 'ok'
    }, fastRetry)
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  it('gives up after the configured number of retries', async () => {
    let calls = 0
    await expect(
      withRetry(async () => {
        calls++
        throw new HorizonUnavailableError('Horizon 503')
      }, { ...fastRetry, retries: 2 }),
    ).rejects.toBeInstanceOf(HorizonUnavailableError)
    expect(calls).toBe(3) // 1 attempt + 2 retries
  })

  it('never retries permanent transaction failures', async () => {
    let calls = 0
    await expect(
      withRetry(async () => {
        calls++
        throw new BadSequenceError()
      }, fastRetry),
    ).rejects.toBeInstanceOf(BadSequenceError)
    expect(calls).toBe(1)
  })

  it('never retries plain (untyped) errors', async () => {
    let calls = 0
    await expect(
      withRetry(async () => {
        calls++
        throw new Error('boom')
      }, fastRetry),
    ).rejects.toThrow('boom')
    expect(calls).toBe(1)
  })

  it('reports each retry via onRetry', async () => {
    const onRetry = vi.fn()
    let calls = 0
    await withRetry(async () => {
      calls++
      if (calls === 1) throw new HorizonUnavailableError('Horizon 500')
      return 'ok'
    }, { ...fastRetry, onRetry })
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry.mock.calls[0][0]).toBeInstanceOf(HorizonUnavailableError)
  })
})

describe('isRetryableError', () => {
  it('is true only for transient StellarSdkErrors', () => {
    expect(isRetryableError(new HorizonUnavailableError('x'))).toBe(true)
    expect(isRetryableError(new BadSequenceError())).toBe(false)
    expect(isRetryableError(new Error('x'))).toBe(false)
    expect(isRetryableError('x')).toBe(false)
  })
})

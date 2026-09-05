import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getContractEvents, subscribeContractEvents, topicToXdr } from '../src/soroban-events'
import type { SorobanEvent } from '../src/soroban-events'

vi.mock('@stellar/stellar-sdk', () => {
  const getEvents = vi.fn()
  const getLatestLedger = vi.fn()
  class Server {
    constructor(_url: string, _opts?: unknown) {}
    getEvents = getEvents
    getLatestLedger = getLatestLedger
  }
  const ScVal = {
    fromXDR: vi.fn((raw: string) => ({ decoded: raw })),
  }
  return { rpc: { Server }, xdr: { ScVal } }
})

import { rpc, xdr } from '@stellar/stellar-sdk'

function makeRawEvent(overrides: Record<string, unknown> = {}): rpc.Api.EventResponse {
  return {
    type: 'contract',
    contractId: {
      contractId: () => 'C CONTRACT',
    },
    ledger: 100,
    id: 'evt-1',
    topic: [{ toXDR: (_f: string) => 'dG9waWM=', decoded: 'dG9waWM=' }],
    value: { toXDR: (_f: string) => 'dmFsdWU=', decoded: 'dmFsdWU=' },
    ...overrides,
  } as unknown as rpc.Api.EventResponse
}

const server = new rpc.Server('https://example.test')

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getContractEvents', () => {
  it('maps RPC events into typed SorobanEvents and decodes ScVals', async () => {
    vi.mocked(server.getEvents).mockResolvedValue({
      events: [makeRawEvent()],
      latestLedger: 200,
      cursor: 'tok-1',
    } as unknown as rpc.Api.GetEventsResponse)

    const result = await getContractEvents(server, { contractId: 'C CONTRACT', startLedger: 1 })
    expect(result.events).toHaveLength(1)
    const evt = result.events[0]
    expect(evt.contractId).toBe('C CONTRACT')
    expect(evt.topic).toEqual(['dG9waWM='])
    expect(evt.topicScVal).toEqual([{ toXDR: expect.any(Function), decoded: 'dG9waWM=' }])
    expect(evt.value).toBe('dmFsdWU=')
    expect(evt.valueScVal).toEqual({ toXDR: expect.any(Function), decoded: 'dmFsdWU=' })
    expect(result.cursor).toBe('tok-1')
    expect(result.latestLedger).toBe(200)
  })

  it('forwards cursor and topic filters to getEvents, preferring cursor over startLedger', async () => {
    vi.mocked(server.getEvents).mockResolvedValue({
      events: [],
      latestLedger: 1,
      cursor: 'tok-prev',
    } as unknown as rpc.Api.GetEventsResponse)

    await getContractEvents(server, {
      contractId: 'C X',
      topic: 'ABC',
      startLedger: 42,
      cursor: 'tok-prev',
      limit: 25,
    })

    // getEvents' request type is a discriminated union — cursor and
    // startLedger are mutually exclusive, and cursor wins when both are given.
    expect(server.getEvents).toHaveBeenCalledWith({
      cursor: 'tok-prev',
      limit: 25,
      filters: [{ contractIds: ['C X'], topics: [['ABC']] }],
    })
  })

  it('forwards startLedger when no cursor is given', async () => {
    vi.mocked(server.getEvents).mockResolvedValue({
      events: [],
      latestLedger: 1,
      cursor: 'tok-1',
    } as unknown as rpc.Api.GetEventsResponse)

    await getContractEvents(server, { contractId: 'C X', startLedger: 42, limit: 25 })

    expect(server.getEvents).toHaveBeenCalledWith({
      startLedger: 42,
      limit: 25,
      filters: [{ contractIds: ['C X'], topics: undefined }],
    })
  })

  it('throws when neither cursor nor startLedger is given', async () => {
    await expect(getContractEvents(server, { contractId: 'C' })).rejects.toThrow(
      'requires either `cursor` or `startLedger`',
    )
    expect(server.getEvents).not.toHaveBeenCalled()
  })

  it('returns the cursor from the response as-is', async () => {
    vi.mocked(server.getEvents).mockResolvedValue({
      events: [makeRawEvent({ id: 'a' }), makeRawEvent({ id: 'b' })],
      latestLedger: 5,
      cursor: 't2',
    } as unknown as rpc.Api.GetEventsResponse)

    const result = await getContractEvents(server, { contractId: 'C', startLedger: 1 })
    expect(result.cursor).toBe('t2')
  })
})

describe('topicToXdr', () => {
  it('encodes a ScVal to its base64 XDR topic string', () => {
    const scVal = { toXDR: (_f: string) => 'base64topic' }
    expect(topicToXdr(scVal as unknown as xdr.ScVal)).toBe('base64topic')
  })
})

describe('subscribeContractEvents', () => {
  it('delivers each event once and de-duplicates across polls', async () => {
    vi.useFakeTimers()
    const onEvent = vi.fn()
    const onError = vi.fn()

    vi.mocked(server.getLatestLedger).mockResolvedValue({
      sequence: 100,
    } as unknown as rpc.Api.GetLatestLedgerResponse)

    vi.mocked(server.getEvents)
      .mockResolvedValueOnce({
        events: [makeRawEvent({ id: 'e1' }), makeRawEvent({ id: 'e2' })],
        cursor: 'p2',
        latestLedger: 10,
      } as unknown as rpc.Api.GetEventsResponse)
      .mockResolvedValueOnce({
        events: [makeRawEvent({ id: 'e2' }), makeRawEvent({ id: 'e3' })],
        cursor: 'p3',
        latestLedger: 11,
      } as unknown as rpc.Api.GetEventsResponse)
      .mockResolvedValueOnce({
        events: [makeRawEvent({ id: 'e1' })],
        cursor: 'p1',
        latestLedger: 12,
      } as unknown as rpc.Api.GetEventsResponse)

    const sub = subscribeContractEvents({
      server,
      contractId: 'C',
      pollIntervalMs: 1000,
      onEvent,
      onError,
    })

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(2000)

    const delivered: string[] = onEvent.mock.calls.map((c) => (c[0] as SorobanEvent).id)
    expect(delivered).toEqual(['e1', 'e2', 'e3'])
    expect(onError).not.toHaveBeenCalled()
    expect(server.getLatestLedger).toHaveBeenCalledTimes(1)
    sub.unsubscribe()
  })

  it('does not resolve a starting ledger when startLedger is already given', async () => {
    vi.useFakeTimers()
    vi.mocked(server.getEvents).mockResolvedValue({
      events: [],
      cursor: 'p1',
      latestLedger: 10,
    } as unknown as rpc.Api.GetEventsResponse)

    const sub = subscribeContractEvents({
      server,
      contractId: 'C',
      startLedger: 5,
      pollIntervalMs: 1000,
      onEvent: vi.fn(),
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(server.getLatestLedger).not.toHaveBeenCalled()
    sub.unsubscribe()
  })

  it('reports poll errors through onError and keeps running', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    vi.mocked(server.getEvents).mockRejectedValue(new Error('boom'))

    const sub = subscribeContractEvents({
      server,
      contractId: 'C',
      startLedger: 1,
      pollIntervalMs: 1000,
      onEvent: vi.fn(),
      onError,
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    sub.unsubscribe()
  })
})

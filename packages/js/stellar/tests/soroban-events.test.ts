import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getContractEvents, subscribeContractEvents, topicToXdr } from '../src/soroban-events'
import type { SorobanEvent } from '../src/soroban-events'

vi.mock('@stellar/stellar-sdk', () => {
  const getEvents = vi.fn()
  class Server {
    constructor(_url: string, _opts?: unknown) {}
    getEvents = getEvents
  }
  const ScVal = {
    fromXDR: vi.fn((raw: string) => ({ decoded: raw })),
  }
  return { rpc: { Server }, xdr: { ScVal } }
})

import { rpc } from '@stellar/stellar-sdk'

function makeRawEvent(overrides: Record<string, unknown> = {}): rpc.EventResponse {
  return {
    type: 'contract',
    contractId: 'C CONTRACT',
    ledger: 100,
    id: 'evt-1',
    pagingToken: 'tok-1',
    topic: [{ toXDR: () => 'dG9waWM=' }],
    value: { toXDR: () => 'dmFsdWU=' },
    ...overrides,
  } as unknown as rpc.EventResponse
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
    } as unknown as rpc.GetEventsResponse)

    const result = await getContractEvents(server, { contractId: 'C CONTRACT' })
    expect(result.events).toHaveLength(1)
    const evt = result.events[0]
    expect(evt.contractId).toBe('C CONTRACT')
    expect(evt.topic).toBe('dG9waWM=')
    expect(evt.topicScVal).toEqual({ toXDR: expect.any(Function) })
    expect(evt.value).toBe('dmFsdWU=')
    expect(evt.valueScVal).toEqual({ toXDR: expect.any(Function) })
    expect(result.cursor).toBe('tok-1')
    expect(result.latestLedger).toBe(200)
  })

  it('forwards startLedger, cursor and topic filters to getEvents', async () => {
    vi.mocked(server.getEvents).mockResolvedValue({
      events: [],
      latestLedger: 1,
    } as unknown as rpc.GetEventsResponse)

    await getContractEvents(server, {
      contractId: 'C X',
      topic: 'ABC',
      startLedger: 42,
      cursor: 'tok-prev',
      limit: 25,
    })

    expect(server.getEvents).toHaveBeenCalledWith({
      startLedger: 42,
      cursor: 'tok-prev',
      limit: 25,
      filters: [{ contractIds: ['C X'], topics: [['ABC']] }],
    })
  })

  it('falls back to the last event paging token when no cursor is returned', async () => {
    vi.mocked(server.getEvents).mockResolvedValue({
      events: [
        makeRawEvent({ id: 'a', pagingToken: 't1' }),
        makeRawEvent({ id: 'b', pagingToken: 't2' }),
      ],
      latestLedger: 5,
    } as unknown as rpc.GetEventsResponse)

    const result = await getContractEvents(server, { contractId: 'C' })
    expect(result.cursor).toBe('t2')
  })
})

describe('topicToXdr', () => {
  it('encodes a ScVal to its base64 XDR topic string', () => {
    const scVal = { toXDR: (_f: string) => 'base64topic' }
    expect(topicToXdr(scVal as unknown as rpc.xdr.ScVal)).toBe('base64topic')
  })
})

describe('subscribeContractEvents', () => {
  it('delivers each event once and de-duplicates across polls', async () => {
    vi.useFakeTimers()
    const onEvent = vi.fn()
    const onError = vi.fn()

    vi.mocked(server.getEvents)
      .mockResolvedValueOnce({
        events: [
          makeRawEvent({ id: 'e1', pagingToken: 'p1' }),
          makeRawEvent({ id: 'e2', pagingToken: 'p2' }),
        ],
        cursor: 'p2',
        latestLedger: 10,
      } as unknown as rpc.GetEventsResponse)
      .mockResolvedValueOnce({
        events: [
          makeRawEvent({ id: 'e2', pagingToken: 'p2' }),
          makeRawEvent({ id: 'e3', pagingToken: 'p3' }),
        ],
        cursor: 'p3',
        latestLedger: 11,
      } as unknown as rpc.GetEventsResponse)
      .mockResolvedValueOnce({
        events: [makeRawEvent({ id: 'e1', pagingToken: 'p1' })],
        cursor: 'p1',
        latestLedger: 12,
      } as unknown as rpc.GetEventsResponse)

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
    sub.unsubscribe()
  })

  it('reports poll errors through onError and keeps running', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    vi.mocked(server.getEvents).mockRejectedValue(new Error('boom'))

    const sub = subscribeContractEvents({
      server,
      contractId: 'C',
      pollIntervalMs: 1000,
      onEvent: vi.fn(),
      onError,
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    sub.unsubscribe()
  })
})

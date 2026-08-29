import { rpc, xdr } from '@stellar/stellar-sdk'
import { NETWORKS, type StellarNetworkId } from './networks'

/**
 * Soroban contract event querying and subscription.
 *
 * NOTE: This is built directly on `@stellar/stellar-sdk`'s `rpc.Server`
 * (`getEvents`) rather than duplicating the dedicated Soroban RPC client work
 * tracked in #103. When #103 lands, the `rpc.Server` instance created here
 * should be swapped for that shared client — the public surface below is
 * intentionally transport-agnostic so that swap is internal only.
 *
 * Soroban RPC has no native push/subscribe API (unlike Horizon's SSE stream
 * for classic payments), so `subscribeContractEvents` is a polling loop with
 * cursor-based deduplication. It is *not* real-time push: events are delivered
 * on the next poll tick after they are sealed into a ledger.
 */

export interface SorobanEvent {
  /** Event type as reported by the RPC node, e.g. "contract" or "system". */
  type: string
  /** The contract that emitted the event. */
  contractId: string
  /** Sequence number of the ledger that contains the event. */
  ledger: number
  /** ISO timestamp of when the containing ledger closed, if reported. */
  ledgerClosedAt?: string
  /** Server-assigned event id. */
  id: string
  /**
   * Paging token for cursor-based pagination. Stable per event and used to
   * resume a query or de-duplicate across subscription polls.
   */
  pagingToken: string
  /**
   * The event's topic segments, base64 XDR-encoded, exactly as the RPC node
   * would accept them back in a topic filter.
   */
  topic: string[]
  /** The same topic segments, already decoded to `ScVal`s by the RPC client. */
  topicScVal: xdr.ScVal[]
  /** Event value, base64 XDR-encoded. */
  value: string
  /** The same value, already decoded to an `ScVal` by the RPC client. */
  valueScVal: xdr.ScVal
}

export interface GetContractEventsOptions {
  /** Contract whose events to query. */
  contractId: string
  /**
   * Topic filter(s), as base64 XDR strings. A single string matches that one
   * topic; an array matches any of the provided topics. Omit to receive all
   * topics emitted by the contract.
   */
  topic?: string | string[]
  /** Earliest ledger (inclusive) to start scanning from. */
  startLedger?: number
  /** Resume token from a previous query/subscription. */
  cursor?: string
  /** Max events per page (server clamps to its own limit). */
  limit?: number
}

export interface GetContractEventsResult {
  events: SorobanEvent[]
  /** Cursor for the most recent event returned; pass as `cursor` to resume. */
  cursor?: string
  /** Latest ledger known to the RPC node at query time. */
  latestLedger: number
}

function mapEvent(ev: rpc.Api.EventResponse): SorobanEvent {
  return {
    type: ev.type,
    contractId: ev.contractId?.contractId() ?? '',
    ledger: ev.ledger,
    ledgerClosedAt: ev.ledgerClosedAt,
    id: ev.id,
    pagingToken: ev.pagingToken,
    topic: ev.topic.map((t) => t.toXDR('base64')),
    topicScVal: ev.topic,
    value: ev.value.toXDR('base64'),
    valueScVal: ev.value,
  }
}

/**
 * Query historical Soroban contract events, paginated by cursor.
 *
 * Pass `cursor` (from a prior result's `cursor`, or from a subscription) to
 * fetch the page *after* the last event you've already seen.
 */
export async function getContractEvents(
  server: rpc.Server,
  options: GetContractEventsOptions,
): Promise<GetContractEventsResult> {
  const topics = options.topic
    ? Array.isArray(options.topic)
      ? options.topic
      : [options.topic]
    : undefined

  const response = await server.getEvents({
    startLedger: options.startLedger,
    cursor: options.cursor,
    limit: options.limit,
    filters: [
      {
        contractIds: [options.contractId],
        topics: topics ? [topics] : undefined,
      },
    ],
  })

  const events = (response.events ?? []).map(mapEvent)
  const last = events[events.length - 1]
  return {
    events,
    cursor: response.cursor ?? last?.pagingToken,
    latestLedger: response.latestLedger,
  }
}

export interface SubscribeContractEventsOptions {
  server: rpc.Server
  contractId: string
  topic?: string | string[]
  /** Ledger to begin scanning from the first time the subscription polls. */
  startLedger?: number
  /** Page cursor to resume scanning from, taking priority over startLedger. */
  cursor?: string
  /** Milliseconds between polls. Defaults to 5000. */
  pollIntervalMs?: number
  /** Called once per newly-seen event, in ledger order. */
  onEvent: (event: SorobanEvent) => void
  /** Called when a poll throws; subscription keeps running unless you unsubscribe. */
  onError?: (error: Error) => void
}

export interface SorobanSubscription {
  /** Stop polling and release the timer. */
  unsubscribe: () => void
}

/**
 * Subscribe to new Soroban contract events via polling.
 *
 * This is **polling with cursor-based deduplication**, not a true push
 * subscription — Soroban RPC offers no streaming endpoint. Each tick fetches
 * events after the last seen cursor and only delivers events whose paging token
 * has not been seen before, so an event is never delivered twice even if a poll
 * boundary splits a batch. `onEvent` fires on the next tick after an event is
 * sealed into a ledger, not instantly.
 */
export function subscribeContractEvents(
  options: SubscribeContractEventsOptions,
): SorobanSubscription {
  const pollIntervalMs = options.pollIntervalMs ?? 5_000
  let cursor = options.cursor
  let started = false
  let timer: ReturnType<typeof setInterval> | undefined

  const seen = new Set<string>()

  async function poll() {
    try {
      const result = await getContractEvents(options.server, {
        contractId: options.contractId,
        topic: options.topic,
        startLedger: started ? undefined : options.startLedger,
        cursor,
      })
      started = true

      for (const event of result.events) {
        if (seen.has(event.pagingToken)) continue
        seen.add(event.pagingToken)
        options.onEvent(event)
      }

      if (result.cursor) cursor = result.cursor
    } catch (err) {
      options.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }

  // Fire immediately so the caller gets the first batch without waiting a full
  // interval, then continue on the interval.
  void poll()
  timer = setInterval(() => void poll(), pollIntervalMs)

  return {
    unsubscribe() {
      if (timer) clearInterval(timer)
      timer = undefined
    },
  }
}

/** Convert an `ScVal` into the base64 XDR topic string the RPC filter expects. */
export function topicToXdr(topic: xdr.ScVal): string {
  return topic.toXDR('base64')
}

/**
 * Convenience: build an `rpc.Server` for a known network id. Most callers can
 * use {@link getSorobanEvents} / {@link subscribeSorobanEvents} instead of
 * constructing a server by hand.
 */
export function sorobanServerForNetwork(
  network: StellarNetworkId,
  allowHttp = false,
): rpc.Server {
  return new rpc.Server(NETWORKS[network].sorobanRpcUrl, { allowHttp })
}

/** Query contract events for a network by id (see {@link getContractEvents}). */
export function getSorobanEvents(
  network: StellarNetworkId,
  options: GetContractEventsOptions,
): Promise<GetContractEventsResult> {
  return getContractEvents(sorobanServerForNetwork(network), options)
}

/** Subscribe to contract events for a network by id (see {@link subscribeContractEvents}). */
export function subscribeSorobanEvents(
  network: StellarNetworkId,
  options: Omit<SubscribeContractEventsOptions, 'server'>,
): SorobanSubscription {
  return subscribeContractEvents({
    ...options,
    server: sorobanServerForNetwork(network),
  })
}

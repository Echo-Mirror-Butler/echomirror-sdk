import type { AnalyticsEvent, Transport } from './types'

export interface PostHogPayload {
  event: string
  distinct_id: string
  properties: Record<string, unknown>
}

export function toPostHog(event: AnalyticsEvent): PostHogPayload {
  return {
    event: event.event,
    distinct_id: event.userId ?? event.anonymousId,
    properties: {
      ...event.properties,
      $session_id: event.sessionId,
      $insert_id: event.messageId,
      timestamp: event.timestamp,
    },
  }
}

export interface MixpanelPayload {
  event: string
  properties: Record<string, unknown>
}

export function toMixpanel(event: AnalyticsEvent): MixpanelPayload {
  return {
    event: event.event,
    properties: {
      ...event.properties,
      distinct_id: event.userId ?? event.anonymousId,
      $insert_id: event.messageId,
      time: Date.parse(event.timestamp),
    },
  }
}

export function webhookTransport(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Transport {
  return async (batch: AnalyticsEvent[]) => {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ batch }),
    })
    if (!res.ok) {
      throw new Error(`Analytics webhook failed with status ${res.status}`)
    }
  }
}

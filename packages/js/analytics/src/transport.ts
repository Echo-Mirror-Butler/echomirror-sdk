import type { AnalyticsBatch, AnalyticsTransport } from './types.js'

export interface WebhookTransportOptions {
  url: string
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
}

/**
 * Sends the documented AnalyticsBatch JSON shape to a plain webhook.
 * The same transport contract can wrap PostHog, Mixpanel, or another vendor.
 */
export function createWebhookTransport(options: WebhookTransportOptions): AnalyticsTransport {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  if (typeof fetchImplementation !== 'function') {
    throw new Error('A fetch implementation is required for webhook analytics')
  }

  return async (batch: AnalyticsBatch): Promise<void> => {
    const response = await fetchImplementation(options.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(batch),
    })

    if (!response.ok) {
      throw new Error(`Analytics webhook failed with status ${response.status}`)
    }
  }
}

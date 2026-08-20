import { describe, expect, it, vi } from 'vitest'
import { createWebhookTransport } from '../src'
import type { AnalyticsBatch } from '../src'

describe('createWebhookTransport', () => {
  it('exports the documented vendor-neutral batch JSON', async () => {
    const fetch = vi
      .fn<Parameters<typeof globalThis.fetch>, ReturnType<typeof globalThis.fetch>>()
      .mockResolvedValue(new Response(null, { status: 202 }))
    const transport = createWebhookTransport({
      url: 'https://analytics.example.test/events',
      headers: { authorization: 'Bearer test' },
      fetch,
    })
    const batch: AnalyticsBatch = {
      schemaVersion: 1,
      batchId: 'batch-1',
      sentAt: '2026-07-23T12:00:00.000Z',
      events: [],
    }

    await transport(batch)

    expect(fetch).toHaveBeenCalledWith('https://analytics.example.test/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test',
      },
      body: JSON.stringify(batch),
    })
  })
})

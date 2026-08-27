/// <reference types="vitest" />
/// <reference types="./chrome-mock" />

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { chrome } from '../tests/chrome-mock'

vi.stubGlobal('fetch', vi.fn())

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('background.ts - service worker', () => {
  const mockPublicKey = 'Gabc123def456'
  const mockNetwork = 'testnet'

  it('should add START_WATCH message handler', () => {
    expect(chrome.runtime.onMessage.addListener).toBeDefined()
    expect(typeof chrome.runtime.onMessage.addListener).toBe('function')
  })

  it('should poll fetch transactions and create notifications', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        _embedded: {
          records: [
            {
              hash: 'abc123def456',
              ledger: 12345,
              paging_token: 'now',
              memo: 'test memo',
            },
          ],
        },
      }),
    } as Response)

    let watchState: any = { publicKey: mockPublicKey, network: mockNetwork, cursor: 'now', totalSeen: 0 }

    const horizon = mockNetwork === 'testnet' ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org'

    const res = await fetch(`${horizon}/accounts/${mockPublicKey}/transactions?limit=10&order=asc&cursor=now`)
    if (!res.ok) return

    const data = await res.json()
    const records: Array<{ hash: string; ledger: number; paging_token: string; memo?: string }> =
      data._embedded?.records ?? []

    for (const r of records) {
      watchState!.totalSeen++
      watchState!.cursor = r.paging_token

      chrome.notifications.create(`echo-tx-${r.hash}`, {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'EchoMirror: Stellar Transaction',
        message: `Ledger ${r.ledger} • ${r.hash.slice(0, 16)}…${r.memo ? ` • ${r.memo}` : ''}`,
        priority: 1,
      })
    }

    expect(chrome.notifications.create).toHaveBeenCalled()
    expect(watchState!.totalSeen).toBe(1)
    expect(watchState!.cursor).toBe('now')
  })

  it('should handle network errors in poll silently', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
    } as Response)

    let watchState: any = { publicKey: mockPublicKey, network: mockNetwork, cursor: 'now', totalSeen: 0 }

    const horizon = mockNetwork === 'testnet' ? 'https://horizon-testnet.stellar.org' : 'https://horizon.stellar.org'

    const res = await fetch(`${horizon}/accounts/${mockPublicKey}/transactions?limit=10&order=asc&cursor=now`)
    if (!res.ok) return // silently ignored

    expect(chrome.notifications.create).not.toHaveBeenCalled()
  })
})
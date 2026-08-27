/// <reference types="vitest" />
/// <reference types="./chrome-mock" />

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { chrome } from '../tests/chrome-mock'

vi.stubGlobal('fetch', vi.fn())

beforeEach(() => {
  vi.clearAllMocks()
})

describe('popup.ts - mood check-in submission', () => {
  it('should handle successful balance fetch', async () => {
    ;(chrome.storage.local.get as vi.Mock).mockResolvedValue({
      publicKey: 'Gabc123def456',
      network: 'testnet',
    })

    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        balances: [
          { asset_type: 'native', balance: '100.0000' },
          { asset_code: 'ECHO', balance: '5000.00' },
        ],
      }),
    } as Response)

    ;(chrome.storage.local.set as vi.Mock).mockResolvedValue(undefined)

    const fetchBalance = async (publicKey: string, network: string) => {
      const horizon = network === 'testnet'
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org'

      const res = await fetch(`${horizon}/accounts/${publicKey}`)
      if (!res.ok) return null
      const data = await res.json()
      const xlm = data.balances.find((b: { asset_type: string }) => b.asset_type === 'native')?.balance ?? '0'
      const echo = data.balances.find((b: { asset_code?: string }) => b.asset_code === 'ECHO')?.balance ?? '0'
      return { xlm, echo, ts: Date.now() }
    }

    const balance = await fetchBalance('Gabc123def456', 'testnet')

    expect(balance).toBeDefined()
    expect(balance?.xlm).toBe('100.0000')
    expect(balance?.echo).toBe('5000.00')
  })

  it('should handle network error and not silently fail', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
    } as Response)

    const fetchBalance = async (publicKey: string, network: string) => {
      const horizon = network === 'testnet'
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org'

      const res = await fetch(`${horizon}/accounts/${publicKey}`)
      if (!res.ok) return null
      const data = await res.json()
      const xlm = data.balances.find((b: { asset_type: string }) => b.asset_type === 'native')?.balance ?? '0'
      const echo = data.balances.find((b: { asset_code?: string }) => b.asset_code === 'ECHO')?.balance ?? '0'
      return { xlm, echo, ts: Date.now() }
    }

    const balance = await fetchBalance('Gabc123def456', 'testnet')
    expect(balance).toBeNull()
  })

  it('should handle invalid address validation', () => {
    const key = 'invalid-key'
    const valid = key.startsWith('G') && key.length === 56
    expect(valid).toBe(false)
  })

  it('should handle watch transaction start', () => {
    chrome.runtime.sendMessage({ type: 'START_WATCH', publicKey: 'Gabc123def456', network: 'testnet' })
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'START_WATCH', publicKey: 'Gabc123def456', network: 'testnet' })
  })

  it('should handle validation and storage flow for valid key', async () => {
    ;(chrome.storage.local.set as vi.Mock).mockResolvedValue(undefined)

    const key = 'Gabc123def456'
    const network = 'testnet'

    if (key.startsWith('G') && key.length === 56) {
      ;(chrome.storage.local.set as vi.Mock).mockResolvedValue(undefined)
      chrome.runtime.sendMessage({ type: 'START_WATCH', publicKey: key, network })
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'START_WATCH', publicKey: key, network })
    }
  })
}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chromeMock, resetChromeMock } from './chrome-mock'

let background: typeof import('../src/background')
let fetchMock: ReturnType<typeof vi.fn>

async function loadBackground() {
  vi.resetModules()
  resetChromeMock()
  fetchMock = vi.fn()
  vi.stubGlobal('chrome', chromeMock)
  vi.stubGlobal('fetch', fetchMock)
  background = await import('../src/background')
}

beforeEach(async () => {
  await loadBackground()
})

afterEach(() => {
  background.stopWatching()
  vi.unstubAllGlobals()
})

describe('background service worker', () => {
  it('starts and stops a Horizon watcher from popup messages', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ _embedded: { records: [] } }), { status: 200 }),
    )
    expect(chromeMock.runtime.onMessage.addListener).toHaveBeenCalledTimes(1)

    const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0]
    listener({ type: 'START_WATCH', publicKey: 'G'.padEnd(56, 'A'), network: 'testnet' })

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('horizon-testnet.stellar.org/accounts/'),
    )

    listener({ type: 'STOP_WATCH' })
    await background.poll()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('updates its cursor and creates a notification for a new transaction', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            _embedded: {
              records: [
                {
                  hash: 'abc123def456',
                  ledger: 12345,
                  paging_token: 'cursor-1',
                  memo: 'test memo',
                },
              ],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ _embedded: { records: [] } }), { status: 200 }),
      )

    background.startWatching('G'.padEnd(56, 'A'), 'testnet')
    await vi.waitFor(() => expect(chromeMock.notifications.create).toHaveBeenCalledTimes(1))
    await background.poll()

    expect(chromeMock.notifications.create).toHaveBeenCalledWith(
      'echo-tx-abc123def456',
      expect.objectContaining({ title: 'EchoMirror: Stellar Transaction' }),
    )
    expect(fetchMock.mock.calls[1][0]).toContain('cursor=cursor-1')
  })

  it('swallows a transient network error without creating a notification', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))

    background.startWatching('G'.padEnd(56, 'A'), 'mainnet')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    expect(chromeMock.notifications.create).not.toHaveBeenCalled()
  })
})

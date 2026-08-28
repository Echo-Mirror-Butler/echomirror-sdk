import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chromeMock, resetChromeMock, storedValue } from './chrome-mock'

let popup: typeof import('../src/popup')
let fetchMock: ReturnType<typeof vi.fn>

function popupMarkup() {
  document.body.innerHTML = `
    <input id="public-key" />
    <select id="network"><option value="testnet">testnet</option><option value="mainnet">mainnet</option></select>
    <button id="check-btn">Check Balance</button>
    <button id="inject-btn">Inject</button>
    <button id="watch-btn">Watch</button>
    <div id="balance"></div>
    <p id="status"></p>
  `
}

async function loadPopup(storage: Record<string, unknown> = {}) {
  vi.resetModules()
  resetChromeMock(storage)
  fetchMock = vi.fn()
  vi.stubGlobal('chrome', chromeMock)
  vi.stubGlobal('fetch', fetchMock)
  popupMarkup()
  popup = await import('../src/popup')
  await popup.initializePopup()
}

beforeEach(async () => {
  await loadPopup()
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('popup mood and wallet flows', () => {
  it('loads a saved key and displays a successful balance lookup', async () => {
    await loadPopup({ publicKey: 'G'.padEnd(56, 'A'), network: 'testnet' })
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          balances: [
            { asset_type: 'native', balance: '100.0000' },
            { asset_code: 'ECHO', balance: '5000.00' },
          ],
        }),
        { status: 200 },
      ),
    )

    const keyInput = document.getElementById('public-key') as HTMLInputElement
    const checkButton = document.getElementById('check-btn') as HTMLButtonElement
    checkButton.click()

    await vi.waitFor(() => {
      expect(document.getElementById('status')?.textContent).toBe('✅ testnet')
    })
    expect(keyInput.value).toBe('G'.padEnd(56, 'A'))
    expect(document.getElementById('balance')?.textContent).toContain('5000.00 ECHO')
    expect(storedValue('balance')).toMatchObject({ xlm: '100.0000', echo: '5000.00' })
  })

  it('shows a visible network error when balance lookup rejects', async () => {
    const keyInput = document.getElementById('public-key') as HTMLInputElement
    keyInput.value = 'G'.padEnd(56, 'B')
    fetchMock.mockRejectedValue(new Error('offline'))

    ;(document.getElementById('check-btn') as HTMLButtonElement).click()

    await vi.waitFor(() => {
      expect(document.getElementById('status')?.textContent).toBe('❌ Network error')
    })
    expect((document.getElementById('check-btn') as HTMLButtonElement).disabled).toBe(false)
  })

  it('rejects an invalid address before making a network request', async () => {
    const keyInput = document.getElementById('public-key') as HTMLInputElement
    keyInput.value = 'not-a-stellar-address'

    ;(document.getElementById('check-btn') as HTMLButtonElement).click()

    expect(document.getElementById('status')?.textContent).toBe('❌ Invalid Stellar address')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('persists the selected account and starts the background watcher', async () => {
    const keyInput = document.getElementById('public-key') as HTMLInputElement
    keyInput.value = 'G'.padEnd(56, 'C')

    ;(document.getElementById('watch-btn') as HTMLButtonElement).click()

    await vi.waitFor(() => {
      expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'START_WATCH',
        publicKey: 'G'.padEnd(56, 'C'),
        network: 'testnet',
      })
    })
    expect(document.getElementById('status')?.textContent).toContain(
      `Watching ${'G'.padEnd(56, 'C').slice(0, 8)}`,
    )
    expect(storedValue('publicKey')).toBe('G'.padEnd(56, 'C'))
  })

  it('injects the mood widget and provides feedback after a mood check-in', () => {
    popup.injectMoodWidget()

    const widget = document.getElementById('echomirror-widget')
    expect(widget).not.toBeNull()
    const widgetButton = widget?.querySelector('button') as HTMLButtonElement
    widgetButton.click()
    expect((widget?.querySelector('#em-log') as HTMLButtonElement).textContent).toBe('Log Mood')

    ;(widget?.querySelector('#em-log') as HTMLButtonElement).click()
    expect(widget?.querySelector('#em-result')?.textContent).toBe('✅ Mood logged!')
  })
})

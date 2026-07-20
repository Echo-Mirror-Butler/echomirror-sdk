import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  WalletNotFoundError,
  WalletUserRejectedError,
} from '../src/errors'
import { connectWallet, detectWallets, getWalletAdapter } from '../src/wallets'
import { FreighterAdapter } from '../src/wallets/freighter'
import { XBullAdapter } from '../src/wallets/xbull'

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015'
const PUBKEY = 'GDNSSYSCSSJ76FER5WEEXME5G4MTCUBKDRQSKOYP36KUKVDB2VCMERS6'

const globals = globalThis as Record<string, unknown>

function installFreighter(overrides: Record<string, unknown> = {}) {
  globals.freighterApi = {
    isConnected: async () => true,
    requestAccess: async () => ({ address: PUBKEY }),
    getNetworkDetails: async () => ({ networkPassphrase: TESTNET_PASSPHRASE }),
    signTransaction: async () => ({ signedTxXdr: 'SIGNED_XDR' }),
    ...overrides,
  }
}

function installXBull(overrides: Record<string, unknown> = {}) {
  globals.xBullSDK = {
    connect: async () => true,
    getPublicKey: async () => PUBKEY,
    signXDR: async (xdr: string) => `signed:${xdr}`,
    ...overrides,
  }
}

beforeEach(() => {
  delete globals.freighterApi
  delete globals.xBullSDK
})

afterEach(() => {
  delete globals.freighterApi
  delete globals.xBullSDK
  vi.restoreAllMocks()
})

describe('FreighterAdapter', () => {
  it('connects via the modern requestAccess flow', async () => {
    installFreighter()
    const connection = await new FreighterAdapter().connect()
    expect(connection).toEqual({ walletId: 'freighter', publicKey: PUBKEY, network: 'testnet' })
  })

  it('connects via the legacy isAllowed/getPublicKey flow', async () => {
    installFreighter({
      requestAccess: undefined,
      isAllowed: async () => false,
      setAllowed: async () => true,
      getPublicKey: async () => PUBKEY,
      getNetworkDetails: async () => ({ networkPassphrase: 'Public Global Stellar Network ; September 2015' }),
    })
    const connection = await new FreighterAdapter().connect()
    expect(connection.publicKey).toBe(PUBKEY)
    expect(connection.network).toBe('mainnet')
  })

  it('unwraps every known signTransaction result shape', async () => {
    const adapter = new FreighterAdapter()
    const opts = { networkPassphrase: TESTNET_PASSPHRASE }

    installFreighter({ signTransaction: async () => 'RAW_STRING_XDR' })
    expect(await adapter.signTransaction('XDR', opts)).toBe('RAW_STRING_XDR')

    installFreighter({ signTransaction: async () => ({ signedTransaction: 'V1_SHAPE' }) })
    expect(await adapter.signTransaction('XDR', opts)).toBe('V1_SHAPE')

    installFreighter({ signTransaction: async () => ({ signedTxXdr: 'V2_SHAPE' }) })
    expect(await adapter.signTransaction('XDR', opts)).toBe('V2_SHAPE')
  })

  it('maps user rejection during signing', async () => {
    installFreighter({
      signTransaction: async () => ({ error: 'User declined access' }),
    })
    await expect(
      new FreighterAdapter().signTransaction('XDR', { networkPassphrase: TESTNET_PASSPHRASE }),
    ).rejects.toBeInstanceOf(WalletUserRejectedError)
  })

  it('throws WalletNotFoundError with install link when missing', async () => {
    await expect(new FreighterAdapter().connect()).rejects.toMatchObject({
      name: 'WalletNotFoundError',
      message: expect.stringContaining('freighter.app'),
    })
  })
})

describe('XBullAdapter', () => {
  it('connects and reports the configured network', async () => {
    installXBull()
    const connection = await new XBullAdapter('testnet').connect()
    expect(connection).toEqual({ walletId: 'xbull', publicKey: PUBKEY, network: 'testnet' })
  })

  it('maps rejection thrown as a bare string', async () => {
    installXBull({ connect: async () => Promise.reject('Connection denied') })
    await expect(new XBullAdapter().connect()).rejects.toBeInstanceOf(WalletUserRejectedError)
  })
})

describe('detection & fallback', () => {
  it('detects only the wallets that are present (none in Node)', async () => {
    expect(await detectWallets()).toEqual([])
  })

  it('detects installed extensions', async () => {
    installFreighter()
    installXBull()
    const ids = (await detectWallets()).map((w) => w.id)
    expect(ids).toContain('freighter')
    expect(ids).toContain('xbull')
    expect(ids).not.toContain('albedo') // no window/document in Node
  })

  it('connectWallet picks the first available wallet in preference order', async () => {
    installXBull() // only xBull installed
    const { adapter, connection } = await connectWallet({ network: 'testnet' })
    expect(adapter.id).toBe('xbull')
    expect(connection.publicKey).toBe(PUBKEY)
  })

  it('connectWallet respects a custom preference order', async () => {
    installFreighter()
    installXBull()
    const { adapter } = await connectWallet({ preferred: ['xbull', 'freighter'] })
    expect(adapter.id).toBe('xbull')
  })

  it('connectWallet fails gracefully with install links for every wallet', async () => {
    const err = await connectWallet().catch((e) => e)
    expect(err).toBeInstanceOf(WalletNotFoundError)
    expect(err.message).toContain('freighter.app')
    expect(err.message).toContain('xbull.app')
    expect(err.message).toContain('albedo.link')
    expect(err.message).toContain('Node.js')
  })

  it('getWalletAdapter returns the requested adapter', () => {
    expect(getWalletAdapter('albedo').name).toBe('Albedo')
  })
})

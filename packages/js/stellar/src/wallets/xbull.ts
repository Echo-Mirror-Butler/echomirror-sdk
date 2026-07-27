import { WalletNotFoundError, mapWalletError } from '../errors'
import type { StellarNetworkId } from '../networks'
import type { SignOptions, WalletAdapter, WalletConnection } from './types'

/** Shape of the API the xBull extension injects at `window.xBullSDK`. */
interface XBullSdk {
  connect(permissions: { canRequestPublicKey: boolean; canRequestSign: boolean }): Promise<unknown>
  getPublicKey(): Promise<string>
  signXDR(xdr: string, opts?: { network?: string; publicKey?: string }): Promise<string>
}

function sdk(): XBullSdk | undefined {
  return (globalThis as Record<string, unknown>).xBullSDK as XBullSdk | undefined
}

/**
 * xBull injects `window.xBullSDK`. Like Albedo it does not expose which
 * network the user has selected, so the adapter is constructed with the
 * network your app targets (defaults to mainnet).
 */
export class XBullAdapter implements WalletAdapter {
  readonly id = 'xbull' as const
  readonly name = 'xBull'
  readonly installUrl = 'https://xbull.app'

  constructor(private readonly network: StellarNetworkId = 'mainnet') {}

  async isAvailable(): Promise<boolean> {
    return sdk() !== undefined
  }

  async connect(): Promise<WalletConnection> {
    const xbull = sdk()
    if (!xbull) {
      throw new WalletNotFoundError(`xBull extension not found. Install it from ${this.installUrl}`, this.id)
    }
    try {
      await xbull.connect({ canRequestPublicKey: true, canRequestSign: true })
      const publicKey = await xbull.getPublicKey()
      return { walletId: this.id, publicKey, network: this.network }
    } catch (err) {
      throw mapWalletError(this.id, err, 'connect')
    }
  }

  async signTransaction(xdr: string, options: SignOptions): Promise<string> {
    const xbull = sdk()
    if (!xbull) {
      throw new WalletNotFoundError(`xBull extension not found. Install it from ${this.installUrl}`, this.id)
    }
    try {
      return await xbull.signXDR(xdr, {
        network: options.networkPassphrase,
        publicKey: options.address,
      })
    } catch (err) {
      throw mapWalletError(this.id, err, 'sign')
    }
  }
}

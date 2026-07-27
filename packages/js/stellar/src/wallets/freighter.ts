import { WalletNotFoundError, mapWalletError } from '../errors'
import { networkFromPassphrase } from '../networks'
import type { SignOptions, WalletAdapter, WalletConnection } from './types'

/**
 * Freighter API surface. Modern Freighter (v3+) does NOT inject a
 * `window.freighterApi` global — pages must talk to the extension through the
 * `@stellar/freighter-api` package (postMessage under the hood), whose calls
 * return `{ ..., error }` result objects. Some very old versions (and test
 * stubs) do inject `window.freighterApi` with bare return values. This adapter
 * supports both: an injected global wins, otherwise the npm package is used.
 */
interface FreighterApi {
  isConnected?: () => Promise<boolean | { isConnected: boolean; error?: unknown }>
  // v2+ access flow
  requestAccess?: () => Promise<{ address?: string; error?: unknown } | string>
  getAddress?: () => Promise<{ address: string; error?: unknown }>
  // legacy access flow
  isAllowed?: () => Promise<boolean | { isAllowed: boolean }>
  setAllowed?: () => Promise<unknown>
  getPublicKey?: () => Promise<string>
  getNetworkDetails: () => Promise<{ networkPassphrase: string; error?: unknown }>
  signTransaction: (
    xdr: string,
    opts: { networkPassphrase: string; address?: string; accountToSign?: string },
  ) => Promise<string | { signedTransaction?: string; signedTxXdr?: string; error?: unknown }>
}

function throwIfError(result: unknown): void {
  const error = (result as { error?: unknown })?.error
  if (error) throw error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error))
}

export class FreighterAdapter implements WalletAdapter {
  readonly id = 'freighter' as const
  readonly name = 'Freighter'
  readonly installUrl = 'https://freighter.app'

  private async api(): Promise<FreighterApi | undefined> {
    const injected = (globalThis as Record<string, unknown>).freighterApi as FreighterApi | undefined
    if (injected) return injected
    // The npm package needs a window to postMessage through.
    if (typeof window === 'undefined') return undefined
    try {
      const mod = await import('@stellar/freighter-api')
      return ((mod as { default?: unknown }).default ?? mod) as FreighterApi
    } catch {
      return undefined
    }
  }

  async isAvailable(): Promise<boolean> {
    const freighter = await this.api()
    if (!freighter) return false
    try {
      const connected = await freighter.isConnected?.()
      if (connected === undefined) return true
      if (typeof connected === 'boolean') return connected
      // freighter-api reports {isConnected:false} + error when not installed
      return connected.isConnected
    } catch {
      return false
    }
  }

  async connect(): Promise<WalletConnection> {
    const freighter = await this.api()
    if (!freighter) {
      throw new WalletNotFoundError(`Freighter extension not found. Install it from ${this.installUrl}`, this.id)
    }
    try {
      const publicKey = await this.requestPublicKey(freighter)
      const details = await freighter.getNetworkDetails()
      throwIfError(details)
      return { walletId: this.id, publicKey, network: networkFromPassphrase(details.networkPassphrase) }
    } catch (err) {
      throw mapWalletError(this.id, err, 'connect')
    }
  }

  private async requestPublicKey(freighter: FreighterApi): Promise<string> {
    if (freighter.requestAccess) {
      const result = await freighter.requestAccess()
      if (typeof result === 'string') return result
      throwIfError(result)
      if (result.address) return result.address
      // Some versions grant access via requestAccess but return the address from getAddress
      if (freighter.getAddress) {
        const addr = await freighter.getAddress()
        throwIfError(addr)
        return addr.address
      }
      throw new Error('Freighter did not return an address')
    }
    // Legacy flow
    const allowed = await freighter.isAllowed?.()
    const isAllowed = typeof allowed === 'boolean' ? allowed : allowed?.isAllowed ?? false
    if (!isAllowed) await freighter.setAllowed?.()
    if (!freighter.getPublicKey) throw new Error('Freighter exposes neither requestAccess nor getPublicKey')
    return freighter.getPublicKey()
  }

  async signTransaction(xdr: string, options: SignOptions): Promise<string> {
    const freighter = await this.api()
    if (!freighter) {
      throw new WalletNotFoundError(`Freighter extension not found. Install it from ${this.installUrl}`, this.id)
    }
    try {
      const result = await freighter.signTransaction(xdr, {
        networkPassphrase: options.networkPassphrase,
        address: options.address,
        accountToSign: options.address,
      })
      if (typeof result === 'string') return result
      throwIfError(result)
      const signed = result.signedTxXdr ?? result.signedTransaction
      if (!signed) throw new Error('Freighter returned no signed transaction')
      return signed
    } catch (err) {
      throw mapWalletError(this.id, err, 'sign')
    }
  }
}

import type { StellarNetworkId } from '../networks'

export type WalletId = 'freighter' | 'albedo' | 'xbull'

export interface WalletConnection {
  walletId: WalletId
  publicKey: string
  network: StellarNetworkId
}

export interface SignOptions {
  /** Network passphrase the transaction targets. */
  networkPassphrase: string
  /** Account expected to sign — enforced by wallets that support it. */
  address?: string
}

/**
 * Common interface every supported wallet is wrapped behind.
 * Get instances via {@link getWalletAdapter} / {@link detectWallets} /
 * {@link connectWallet} rather than constructing them directly.
 */
export interface WalletAdapter {
  readonly id: WalletId
  readonly name: string
  /** Where users can install this wallet — used in fallback messaging. */
  readonly installUrl: string
  /** Whether the wallet can be used in the current environment. Never throws. */
  isAvailable(): Promise<boolean>
  /** Request access and return the user's public key + network. */
  connect(): Promise<WalletConnection>
  /** Sign a base64 transaction envelope XDR; returns the signed XDR. */
  signTransaction(xdr: string, options: SignOptions): Promise<string>
}

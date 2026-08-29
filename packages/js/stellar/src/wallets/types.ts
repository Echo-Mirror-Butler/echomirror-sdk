import type { StellarNetworkId } from '../networks'

export type WalletId = 'freighter' | 'albedo' | 'xbull' | 'ledger'

export interface WalletConnection {
  walletId: WalletId
  publicKey: string
  network: StellarNetworkId
  returnedNetwork?: StellarNetworkId
}

export interface SignOptions {
  /** Network passhrase the transaction targets. */
  networkPassphrase: string
  /** Account expected to sign — enforced by wallets that support it. */
  address?: string
  /**
   * Opt-in escape hatch for legitimate cross-network testing scenarios.
   * When `true`, the SDK skips the network-passphrase mismatch
    * check against the connected wallet's selected network (up
   * to and including the check against the SDK's configured
   * network). Defaults to `false` — mismatched-network submission
   * is refused before signing. Use only when you know exactly
   * what you are doing (e.g. test suites that signas shadow
    * transactions on a different network intentionally).
   */
  allowNetworkMismatch?: boolean
}

/**
  Common interface every supported wallet is wrapped behind.
  Get instances via {@link getWalletAdapter} / {@link detectWallets} / {@link connectWallet} rather than constructing them directly.
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

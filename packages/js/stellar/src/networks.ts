export type StellarNetworkId = 'mainnet' | 'testnet'

export interface StellarNetworkConfig {
  id: StellarNetworkId
  passphrase: string
  horizonUrl: string
  friendbotUrl?: string
}

export const NETWORKS: Record<StellarNetworkId, StellarNetworkConfig> = {
  mainnet: {
    id: 'mainnet',
    passphrase: 'Public Global Stellar Network ; September 2015',
    horizonUrl: 'https://horizon.stellar.org',
  },
  testnet: {
    id: 'testnet',
    passphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    friendbotUrl: 'https://friendbot.stellar.org',
  },
}

export function networkFromPassphrase(passphrase: string): StellarNetworkId {
  return passphrase === NETWORKS.testnet.passphrase || /test/i.test(passphrase) ? 'testnet' : 'mainnet'
}

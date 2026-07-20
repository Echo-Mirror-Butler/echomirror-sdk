/**
 * Browser harness driven by the Playwright Freighter spec. Uses the public
 * SDK surface exactly the way an integrating app would.
 */
import { StellarClient, connectWallet, type WalletAdapter } from '../../src'

const $ = (id: string) => document.getElementById(id)!

let adapter: WalletAdapter | undefined
let publicKey = ''

const client = new StellarClient({ network: 'testnet' })

$('connect').addEventListener('click', async () => {
  $('status').textContent = 'connecting'
  try {
    const result = await connectWallet({ network: 'testnet' })
    adapter = result.adapter
    publicKey = result.connection.publicKey
    $('wallet-id').textContent = result.adapter.id
    $('pubkey').textContent = result.connection.publicKey
    $('network').textContent = result.connection.network
    $('status').textContent = 'connected'
  } catch (err) {
    $('error').textContent = (err as Error).message
    $('status').textContent = 'connect-failed'
  }
})

$('pay').addEventListener('click', async () => {
  $('status').textContent = 'paying'
  try {
    if (!adapter) throw new Error('connect first')
    const tx = await client.buildPaymentTransaction({
      source: publicKey,
      destination: ($('destination') as HTMLInputElement).value,
      amount: ($('amount') as HTMLInputElement).value,
      memo: 'echomirror e2e',
    })
    const result = await client.signAndSubmit(adapter, tx, { address: publicKey })
    $('tx-hash').textContent = result.hash
    $('status').textContent = 'paid'
  } catch (err) {
    $('error').textContent = `${(err as { name?: string }).name}: ${(err as Error).message}`
    $('status').textContent = 'pay-failed'
  }
})

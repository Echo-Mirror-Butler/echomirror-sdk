/**
 * End-to-end test of the Freighter wallet integration in a real browser.
 *
 * Loads the actual Freighter extension into Chromium, creates a wallet through
 * its onboarding UI, switches it to Test Net, then drives the bundled SDK
 * harness page (e2e/app) through connect → approve, receives testnet funds via
 * Friendbot, sends a payment signed inside the Freighter popup, and asserts
 * the payment landed on-chain via Horizon.
 */
import { expect, test, type BrowserContext } from '@playwright/test'
import { Keypair } from '@stellar/stellar-sdk'
import { StellarClient } from '../src/client'
import { toStroops } from '../src/amounts'
import { approveNextPopup, launchWithFreighter, onboardFreighter, switchFreighterToTestnet } from './helpers'

let context: BrowserContext
let extensionId: string
const stellar = new StellarClient({ network: 'testnet' })

test.beforeAll(async () => {
  ;({ context, extensionId } = await launchWithFreighter())
  await onboardFreighter(context, extensionId)
  await switchFreighterToTestnet(context, extensionId)
})

test.afterAll(async () => {
  await context?.close()
})

test('connect, fund, and send an XLM payment signed by Freighter', async () => {
  const page = await context.newPage()
  await page.goto('/')

  // ── Connect: the SDK auto-detects Freighter; approve the access popup ──────
  const approval = approveNextPopup(context, extensionId)
  await page.click('#connect')
  await approval

  await expect(page.locator('#status')).toHaveText('connected', { timeout: 30_000 })
  await expect(page.locator('#wallet-id')).toHaveText('freighter')
  await expect(page.locator('#network')).toHaveText('testnet')
  const publicKey = (await page.locator('#pubkey').textContent()) ?? ''
  expect(publicKey).toMatch(/^G[A-Z2-7]{55}$/)

  // ── Fund the wallet + a destination account via Friendbot ──────────────────
  const destination = Keypair.random()
  await Promise.all([
    stellar.fundWithFriendbot(publicKey),
    stellar.fundWithFriendbot(destination.publicKey()),
  ])
  const before = await xlmBalance(destination.publicKey())

  // ── Pay: SDK builds the tx, Freighter popup signs it, SDK submits ──────────
  await page.fill('#destination', destination.publicKey())
  await page.fill('#amount', '10')
  const signApproval = approveNextPopup(context, extensionId)
  await page.click('#pay')
  await signApproval

  await expect(page.locator('#status')).toHaveText('paid', { timeout: 60_000 })
  const hash = (await page.locator('#tx-hash').textContent()) ?? ''
  expect(hash).toMatch(/^[0-9a-f]{64}$/)

  // ── Assert on-chain state through Horizon ──────────────────────────────────
  const after = await xlmBalance(destination.publicKey())
  expect(after - before).toBe(toStroops('10'))
})

async function xlmBalance(accountId: string): Promise<bigint> {
  const account = await stellar.loadAccount(accountId)
  const native = account.balances.find((b) => b.asset_type === 'native')!
  return toStroops(native.balance)
}

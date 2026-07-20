/**
 * Freighter-in-Playwright plumbing: load the unpacked extension into a
 * persistent Chromium context, drive its onboarding UI, switch it to testnet,
 * and approve its confirmation popups.
 *
 * Selectors are pinned to the Freighter version fetched by
 * scripts/fetch-freighter.mjs (data-testids from the Freighter codebase, which
 * have been stable across recent releases). If Freighter's UI changes, update
 * them here and nowhere else.
 */
import { chromium, expect, type BrowserContext, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Playwright transpiles specs to CJS, so __dirname is available here.
export const EXTENSION_DIR = join(__dirname, '.freighter')
export const WALLET_PASSWORD = 'EchoMirror-e2e-passw0rd!'

export async function launchWithFreighter(): Promise<{ context: BrowserContext; extensionId: string }> {
  if (!existsSync(join(EXTENSION_DIR, 'manifest.json'))) {
    throw new Error('Freighter extension not found. Run: node e2e/scripts/fetch-freighter.mjs')
  }
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', // new headless supports extensions; use xvfb in CI if unavailable
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  })
  let [worker] = context.serviceWorkers()
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 })
  return { context, extensionId: new URL(worker.url()).host }
}

/** Create a fresh wallet (skipping recovery-phrase confirmation). */
export async function onboardFreighter(context: BrowserContext, extensionId: string): Promise<void> {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/index.html`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Create new wallet').click({ timeout: 20_000 })
  await page.getByTestId('account-creator-password-input').fill(WALLET_PASSWORD)
  await page.getByTestId('account-creator-confirm-password-input').fill(WALLET_PASSWORD)
  await page.getByTestId('account-creator-termsOfUse-input').check({ force: true })
  await page.getByTestId('account-creator-submit').click()
  await page.getByText('Do this later').click({ timeout: 20_000 })
  await expect(page.getByText(/all set!/)).toBeVisible({ timeout: 20_000 })
  await page.close()
}

/** Flip the wallet to Test Net via the home-view network selector. */
export async function switchFreighterToTestnet(context: BrowserContext, extensionId: string): Promise<void> {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/index.html#/`, { waitUntil: 'domcontentloaded' })
  await page.reload() // the SPA occasionally needs a reload to leave onboarding state
  await page.getByTestId('network-selector-open').click({ timeout: 20_000 })
  await page.getByText('Test Net', { exact: true }).click()
  await expect(page.getByTestId('network-selector-open')).toContainText('Test Net', { timeout: 20_000 })
  await page.close()
}

/**
 * Wait for the next Freighter confirmation popup and approve it.
 * Freighter's approve button label differs per intent (grant access vs sign),
 * so click the first matching candidate.
 */
export async function approveNextPopup(context: BrowserContext, extensionId: string): Promise<void> {
  const popup = await context.waitForEvent('page', {
    predicate: (p: Page) => p.url().includes(extensionId),
    timeout: 30_000,
  })
  await popup.waitForLoadState('domcontentloaded')

  const candidates = ['Connect', 'Approve', 'Sign', 'Confirm', 'Share', 'Allow']
  for (let attempt = 0; attempt < 40; attempt++) {
    for (const label of candidates) {
      const button = popup.getByRole('button', { name: label, exact: true })
      if (await button.isVisible().catch(() => false)) {
        await button.click()
        await popup.waitForEvent('close', { timeout: 15_000 }).catch(() => undefined)
        return
      }
    }
    await popup.waitForTimeout(500)
  }
  throw new Error(`No approve button found in Freighter popup (${popup.url()})`)
}

import { test as base, expect, request as playwrightRequest, type Browser } from '@playwright/test'
import { e2eClientAddressForTest } from './client-address'

export { expect, playwrightRequest }
export type { Locator, Page, Request, TestInfo } from '@playwright/test'

/**
 * Each test gets its own client address. Playwright workers all connect from
 * 127.0.0.1, and /result allows 30 quiz loads a minute per address.
 * The default context, `request`, and `browser.newContext()` send it.
 * `rawStatus` in security.spec reads E2E_CLIENT_ADDRESS, because that helper
 * uses node:http directly. A caller that sets x-forwarded-for still overrides this.
 */
export const test = base.extend<{ clientAddress: string }>({
  clientAddress: [
    async ({ browser }, use, testInfo) => {
      const address = e2eClientAddressForTest(testInfo)
      const previous = process.env.E2E_CLIENT_ADDRESS
      const original = browser.newContext.bind(browser) as Browser['newContext']
      browser.newContext = (options = {}) =>
        original({
          ...options,
          extraHTTPHeaders: { 'x-forwarded-for': address, ...options.extraHTTPHeaders },
        })
      process.env.E2E_CLIENT_ADDRESS = address
      try {
        await use(address)
      } finally {
        browser.newContext = original
        if (previous === undefined) delete process.env.E2E_CLIENT_ADDRESS
        else process.env.E2E_CLIENT_ADDRESS = previous
      }
    },
    { auto: true },
  ],
  context: async ({ context, clientAddress }, use) => {
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': clientAddress })
    await use(context)
  },
  request: async ({ playwright, clientAddress }, use) => {
    const request = await playwright.request.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': clientAddress },
    })
    await use(request)
    await request.dispose()
  },
})

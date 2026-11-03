import { test as base, expect, request as playwrightRequest } from '@playwright/test'
import { e2eClientAddressForTest } from './client-address'

export { expect, playwrightRequest }
export type { Locator, Page, Request, TestInfo } from '@playwright/test'

/**
 * Each test gets its own client address. Playwright workers all connect from
 * 127.0.0.1, and /result allows 30 quiz loads a minute per address.
 * `context` and `request` send it. `rawStatus` in security.spec reads
 * E2E_CLIENT_ADDRESS, because that helper uses node:http directly.
 * A test that sets x-forwarded-for on one call still overrides this.
 */
export const test = base.extend<{ clientAddress: string }>({
  clientAddress: [
    // Playwright requires an object pattern here even when the fixture has no dependencies.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      const address = e2eClientAddressForTest(testInfo)
      const previous = process.env.E2E_CLIENT_ADDRESS
      process.env.E2E_CLIENT_ADDRESS = address
      await use(address)
      if (previous === undefined) delete process.env.E2E_CLIENT_ADDRESS
      else process.env.E2E_CLIENT_ADDRESS = previous
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

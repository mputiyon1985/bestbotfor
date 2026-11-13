import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BUILD_ADDON_CTA,
  BUILD_ADDON_URL,
  BUILD_FULFILLMENT,
  BUILD_INTRO_NOTE,
  BUILD_PAYMENT_HOST,
  BUILD_PAYMENT_URLS,
  BUILD_SESSION_CTA,
  BUILD_SESSION_URL,
} from './build-offer'

vi.mock('@/lib/visible-tool-count', () => ({
  visibleToolCountLabel: vi.fn(async () => null),
}))

const SESSION_URL = 'https://buy.stripe.com/7sYcN67vW9Kagg2aZmfrW08'
const ADDON_URL = 'https://buy.stripe.com/eVq00kbMc1dE3tgd7ufrW09'

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), 'utf8')
}

function expectPlainStripeUrl(url: string): void {
  const parsed = new URL(url)
  expect(parsed.protocol).toBe('https:')
  expect(parsed.hostname).toBe(BUILD_PAYMENT_HOST)
  expect(parsed.username).toBe('')
  expect(parsed.password).toBe('')
  expect(parsed.port).toBe('')
  expect(parsed.search).toBe('')
  expect(parsed.hash).toBe('')
  expect(url).not.toMatch(/utm/i)
}

describe('build offer links', () => {
  it('uses the two live Stripe Payment Links with no query and no utm', () => {
    expect(BUILD_SESSION_URL).toBe(SESSION_URL)
    expect(BUILD_ADDON_URL).toBe(ADDON_URL)
    expect(BUILD_SESSION_CTA).toBe('Book it — $497')
    expect(BUILD_ADDON_CTA).toBe('Add a workflow — $197')
    expect(BUILD_PAYMENT_URLS).toEqual([SESSION_URL, ADDON_URL])
    for (const url of BUILD_PAYMENT_URLS) expectPlainStripeUrl(url)
  })
})

describe('/build page', () => {
  beforeEach(async () => {
    const { visibleToolCountLabel } = await import('@/lib/visible-tool-count')
    vi.mocked(visibleToolCountLabel).mockReset()
    vi.mocked(visibleToolCountLabel).mockResolvedValue(null)
  })

  async function html(): Promise<string> {
    const { default: BuildPage } = await import('@/app/build/page')
    return renderToStaticMarkup(await BuildPage())
  }

  it('renders both Payment Links exactly, with the booking note beside them', async () => {
    const { visibleToolCountLabel } = await import('@/lib/visible-tool-count')
    vi.mocked(visibleToolCountLabel).mockResolvedValue({ formatted: '1,260', noun: 'tools' })
    const page = await html()
    expect(page).toContain('>AI Tool Audit + Setup</h1>')
    expect(page).toContain('1,260 AI tools listed')
    expect(page).toContain(`href="${SESSION_URL}"`)
    expect(page).toContain(`href="${ADDON_URL}"`)
    expect(page).toContain('>Book it — $497</a>')
    expect(page).toContain('>Add a workflow — $197</a>')
    expect(page).toContain(BUILD_FULFILLMENT)
    expect(page).toContain(BUILD_INTRO_NOTE)
    expect(page).not.toMatch(/utm/i)
    expect(page).not.toMatch(/buy\.stripe\.com\/[^"]*\?/)
    expect(page).not.toMatch(/\$750|first three|spots left|countdown/i)
    expect(page).not.toMatch(/\b360\b/)
  })

  it('still renders the offer when the catalog count is unavailable', async () => {
    const page = await html()
    expect(page).toContain(`href="${SESSION_URL}"`)
    expect(page).toContain(`href="${ADDON_URL}"`)
    expect(page).toContain('BestBotFor is the guide for picking one AI tool for a job.')
    expect(page).not.toContain('AI tools listed')
  })

  it('is linked from the homepage, the footer nav, and /sponsor', () => {
    expect(source('src/app/page.tsx')).toContain('href="/build"')
    const footer = source('src/components/site-footer.tsx')
    expect(footer).toContain('aria-label="Company"')
    expect(footer).toContain('href="/build">AI setup</Link>')
    expect(source('src/app/sponsor/page.tsx')).toContain('href="/build"')
    expect(source('src/app/sitemap.ts')).toContain("'/build'")
    const page = source('src/app/build/page.tsx')
    expect(page).toContain('pageMetadata(')
    expect(page).toContain("path: '/build'")
    expect(page).not.toContain('noIndex')
    expect(page).not.toMatch(/\$750|first three|countdown/)
  })
})

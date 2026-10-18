import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import SponsorPage from '@/app/sponsor/page'
import { resetStripeCache } from '@/lib/stripe'
import {
  FOUNDING_SPONSOR_LIMIT,
  SPONSOR_PAYMENT_LINK_HOST,
  SPONSOR_PAYMENT_LINKS,
  SPONSOR_SUBSCRIPTION_NOTICE,
} from './sponsor-payment-links'

const liveKey = ['sk', 'live', 'example'].join('_')
const testKey = ['sk', 'test', 'example'].join('_')
const allowLive = ['tr', 'ue'].join('')

const ENV_KEYS = ['VERCEL_ENV', 'STRIPE_ALLOW_LIVE', 'STRIPE_SECRET_KEY'] as const
const ORIGINAL = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  resetStripeCache()
  for (const key of ENV_KEYS) {
    const value = ORIGINAL[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function pageHtml(env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): string {
  for (const key of ENV_KEYS) {
    const value = env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetStripeCache()
  return renderToStaticMarkup(createElement(SponsorPage))
}

describe('sponsor payment links', () => {
  it('points only at Stripe-hosted https Payment Links', () => {
    expect(SPONSOR_PAYMENT_LINKS.map((link) => link.id)).toEqual(['founding_sponsor', 'sponsor_monthly'])
    for (const link of SPONSOR_PAYMENT_LINKS) {
      const url = new URL(link.url)
      expect(url.protocol).toBe('https:')
      expect(url.host).toBe(SPONSOR_PAYMENT_LINK_HOST)
      expect(url.search).toBe('')
      expect(link.paymentLinkId).toMatch(/^plink_[A-Za-z0-9]+$/)
    }
  })

  it('states the founding terms as a price lock with a 5-sponsor cap', () => {
    const [founding, monthly] = SPONSOR_PAYMENT_LINKS
    expect(FOUNDING_SPONSOR_LIMIT).toBe(5)
    expect(founding.terms).toBe(
      '$99 for the first 2 weeks, then $299/mo. Founding price locked for 6 months. Cancel anytime. Limited to 5 sponsors.',
    )
    expect(monthly.terms).toBe('$299/mo. Cancel anytime.')
    for (const link of SPONSOR_PAYMENT_LINKS) expect(link.terms.toLowerCase()).not.toContain('commitment')
  })

  it('shows both subscriptions next to the one-time options when live billing is on', () => {
    const html = pageHtml({ VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey })
    expect(html).toContain('Sponsor subscriptions')
    expect(html).toContain(SPONSOR_SUBSCRIPTION_NOTICE)
    expect(html).toContain('Featured placement: $299 for one month.')
    for (const link of SPONSOR_PAYMENT_LINKS) {
      expect(html).toContain(`href="${link.url}"`)
      expect(html).toContain(link.terms)
      expect(html).toContain(link.cta)
    }
    expect(html.indexOf('Sponsor subscriptions')).toBeGreaterThan(html.indexOf('Newsletter sponsor slot:'))
  })

  it('hides the live links on test checkout and on closed production', () => {
    const preview = pageHtml({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: testKey })
    const closed = pageHtml({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: testKey })
    for (const html of [preview, closed]) {
      expect(html).not.toContain('Sponsor subscriptions')
      expect(html).not.toContain(SPONSOR_PAYMENT_LINK_HOST)
    }
    expect(preview).toContain('Stripe test mode')
  })
})

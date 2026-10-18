import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import SponsorPage from '@/app/sponsor/page'
import { SPONSOR_CONTACT_EMAIL, SPONSOR_CONTACT_MAILTO } from '@/lib/sponsor-checkout-gate'
import { resetStripeCache } from '@/lib/stripe'
import {
  FOUNDING_SPONSOR_LIMIT,
  SPONSOR_CANCEL_LINE,
  SPONSOR_PAYMENT_LINK_HOST,
  SPONSOR_PAYMENT_LINKS,
  SPONSOR_SUBSCRIPTION_DISCLOSURE,
  SPONSOR_SUBSCRIPTION_NOTICE,
} from './sponsor-payment-links'

const liveKey = ['sk', 'live', 'example'].join('_')
const testKey = ['sk', 'test', 'example'].join('_')
const allowLive = ['tr', 'ue'].join('')

const ENV_KEYS = [
  'VERCEL_ENV',
  'STRIPE_ALLOW_LIVE',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_FOUNDING_MONTHLY',
  'STRIPE_PRICE_FOUNDING_SETUP',
] as const
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
      '$99 for the first 2 weeks, then $299/mo. Price locked at $299/mo for 6 months. Cancel anytime. Limited to 5 sponsors.',
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
    expect(html).toContain('Continue to checkout')
    expect(html).toContain(`${SPONSOR_SUBSCRIPTION_DISCLOSURE} <a class="underline" href="/disclosure">Disclosures</a>.`)
    expect(html).toContain(`${SPONSOR_CANCEL_LINE} <a class="inline-flex min-h-11 items-center font-semibold underline" href="${SPONSOR_CONTACT_MAILTO}">${SPONSOR_CONTACT_EMAIL}</a>`)
    expect(html.replace(/<[^>]+>/g, '')).toContain('To cancel, email mark@bestbotfor.com')
    expect(html.replace(/<[^>]+>/g, '')).toContain('Placements carry a Sponsored label and never change rankings. See Disclosures.')
    expect(html).toContain(`Questions or custom deals? <a class="inline-flex min-h-11 items-center font-semibold underline" href="${SPONSOR_CONTACT_MAILTO}">${SPONSOR_CONTACT_EMAIL}</a>`)
  })

  it('hides the live links on test checkout and on closed production', () => {
    const preview = pageHtml({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: testKey })
    const closed = pageHtml({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: testKey })
    for (const html of [preview, closed]) {
      expect(html).not.toContain('Sponsor subscriptions')
      expect(html).not.toContain(SPONSOR_PAYMENT_LINK_HOST)
    }
    for (const html of [preview, closed]) {
      expect(html).not.toContain(SPONSOR_CANCEL_LINE)
      expect(html).not.toContain(SPONSOR_SUBSCRIPTION_DISCLOSURE)
    }
    expect(preview).toContain('Stripe test mode')
    expect(preview).not.toContain('Questions or custom deals?')
    expect(closed).not.toContain('Questions or custom deals?')
  })

  it('hides the live links on preview even with the live flag and a live key', () => {
    for (const env of ['preview', 'development', 'test']) {
      const html = pageHtml({ VERCEL_ENV: env, STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey })
      expect(html).not.toContain('Sponsor subscriptions')
      expect(html).not.toContain(SPONSOR_PAYMENT_LINK_HOST)
      expect(html).not.toContain(SPONSOR_CANCEL_LINE)
      expect(html).not.toContain('Questions or custom deals?')
    }
  })

  it('hides the live links on production with a live key but without the live flag', () => {
    for (const flag of [undefined, '', 'TRUE', '1', `${allowLive} `]) {
      const html = pageHtml({ VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: flag, STRIPE_SECRET_KEY: liveKey })
      expect(html).not.toContain('Sponsor subscriptions')
      expect(html).not.toContain(SPONSOR_PAYMENT_LINK_HOST)
      expect(html).not.toContain(SPONSOR_CANCEL_LINE)
      expect(html).not.toContain('Questions or custom deals?')
    }
  })

  describe('founding go-live gate', () => {
    const live = { VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey }
    const [foundingLink, monthlyLink] = SPONSOR_PAYMENT_LINKS
    const foundingRadio = (html: string) => html.match(/<input[^>]*value="founding_sponsor"[^>]*>/)?.[0] ?? ''

    it('shows the founding Payment Link while the in-app founding Prices are not set', () => {
      const html = pageHtml({ ...live, STRIPE_PRICE_FOUNDING_MONTHLY: undefined, STRIPE_PRICE_FOUNDING_SETUP: undefined })
      expect(html).toContain(`href="${foundingLink.url}"`)
      expect(html).toContain(foundingLink.cta)
      expect(html).toContain(`href="${monthlyLink.url}"`)
      expect(foundingRadio(html)).toContain('disabled')
    })

    it('still shows the founding Payment Link when only one founding Price is set', () => {
      for (const env of [
        { STRIPE_PRICE_FOUNDING_MONTHLY: 'price_founding_monthly_test', STRIPE_PRICE_FOUNDING_SETUP: undefined },
        { STRIPE_PRICE_FOUNDING_MONTHLY: undefined, STRIPE_PRICE_FOUNDING_SETUP: 'price_founding_setup_test' },
      ]) {
        const html = pageHtml({ ...live, ...env })
        expect(html).toContain(`href="${foundingLink.url}"`)
        expect(foundingRadio(html)).toContain('disabled')
      }
    })

    it('hides the founding Payment Link and shows the in-app founding offer once the founding Prices are set', () => {
      const html = pageHtml({
        ...live,
        STRIPE_PRICE_FOUNDING_MONTHLY: 'price_founding_monthly_test',
        STRIPE_PRICE_FOUNDING_SETUP: 'price_founding_setup_test',
      })
      expect(html).not.toContain(foundingLink.url)
      expect(html).not.toContain(foundingLink.paymentLinkId)
      expect(html).not.toContain(foundingLink.cta)
      expect(html).toContain(`href="${monthlyLink.url}"`)
      expect(html).toContain(monthlyLink.cta)
      expect(html).toContain(SPONSOR_CANCEL_LINE)
      const radio = foundingRadio(html)
      expect(radio).not.toBe('')
      expect(radio).not.toContain('disabled')
    })
  })
})

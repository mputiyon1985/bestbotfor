import { isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SponsorPage from '@/app/sponsor/page'
import { SponsorForm, type SponsorFormOffering } from '@/components/sponsor-form'
import { SPONSOR_CONTACT_EMAIL, SPONSOR_CONTACT_MAILTO } from '@/lib/sponsor-checkout-gate'
import {
  SPONSOR_FOUNDING_NOTICE,
  SPONSOR_OFFERING_NOT_CONFIGURED,
  SPONSOR_SUBSCRIPTION_NOTICE as OFFERING_SUBSCRIPTION_NOTICE,
} from '@/lib/sponsor-offerings'
import { resetStripeCache } from '@/lib/stripe'
import {
  SPONSOR_CANCEL_LINE,
  SPONSOR_PAYMENT_LINK_HOST,
  SPONSOR_PAYMENT_LINKS,
  SPONSOR_SUBSCRIPTION_DISCLOSURE,
  SPONSOR_SUBSCRIPTION_NOTICE,
} from './sponsor-payment-links'

// These tests cover the env gates. The founding sold-out read is covered in founding-sold-out.test.ts.
vi.mock('@/lib/sponsor-availability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sponsor-availability')>()),
  foundingSoldOutNow: async () => false,
}))

const liveKey = ['sk', 'live', 'example'].join('_')
const testKey = ['sk', 'test', 'example'].join('_')
const allowLive = ['tr', 'ue'].join('')

const ENV_KEYS = [
  'VERCEL_ENV',
  'STRIPE_ALLOW_LIVE',
  'STRIPE_SECRET_KEY',
  'STRIPE_PRICE_FOUNDING_MONTHLY',
  'STRIPE_PRICE_FOUNDING_SETUP',
  'STRIPE_PRICE_PLACEMENT_SUBSCRIPTION',
  'STRIPE_PRICE_PLACEMENT_MONTHLY',
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

async function pageHtml(env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): Promise<string> {
  for (const key of ENV_KEYS) {
    const value = env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetStripeCache()
  return renderToStaticMarkup(await SponsorPage())
}

describe('sponsor payment links', () => {
  it('points only at Stripe-hosted https Payment Links', async () => {
    expect(SPONSOR_PAYMENT_LINKS.map((link) => link.id)).toEqual(['sponsor_monthly'])
    for (const link of SPONSOR_PAYMENT_LINKS) {
      const url = new URL(link.url)
      expect(url.protocol).toBe('https:')
      expect(url.host).toBe(SPONSOR_PAYMENT_LINK_HOST)
      expect(url.search).toBe('')
      expect(link.paymentLinkId).toMatch(/^plink_[A-Za-z0-9]+$/)
    }
  })

  it('states the Monthly terms with no commitment', async () => {
    const [monthly] = SPONSOR_PAYMENT_LINKS
    expect(monthly.terms).toBe('$299/mo. Cancel anytime.')
    for (const link of SPONSOR_PAYMENT_LINKS) expect(link.terms.toLowerCase()).not.toContain('commitment')
  })

  it('shows both subscriptions next to the one-time options when live billing is on', async () => {
    const html = await pageHtml({ VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey })
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

  it('hides the live links on test checkout and on closed production', async () => {
    const preview = await pageHtml({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: testKey })
    const closed = await pageHtml({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: testKey })
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

  it('hides the live links on preview even with the live flag and a live key', async () => {
    for (const env of ['preview', 'development', 'test']) {
      const html = await pageHtml({ VERCEL_ENV: env, STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey })
      expect(html).not.toContain('Sponsor subscriptions')
      expect(html).not.toContain(SPONSOR_PAYMENT_LINK_HOST)
      expect(html).not.toContain(SPONSOR_CANCEL_LINE)
      expect(html).not.toContain('Questions or custom deals?')
    }
  })

  it('hides the live links on production with a live key but without the live flag', async () => {
    for (const flag of [undefined, '', 'TRUE', '1', `${allowLive} `]) {
      const html = await pageHtml({ VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: flag, STRIPE_SECRET_KEY: liveKey })
      expect(html).not.toContain('Sponsor subscriptions')
      expect(html).not.toContain(SPONSOR_PAYMENT_LINK_HOST)
      expect(html).not.toContain(SPONSOR_CANCEL_LINE)
      expect(html).not.toContain('Questions or custom deals?')
    }
  })

  describe('retired founding Payment Link', () => {
    const live = { VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey }
    // Deactivated in Stripe at the 2026-10-19 go-live and removed from the code (Sentinel P3-6 on #97).
    const RETIRED_FOUNDING_LINK = { id: 'plink_1URylTIJUbygfAuc07cebXfn', url: 'https://buy.stripe.com/fZudRabMce0q5BoebyfrW04' }
    const [monthlyLink] = SPONSOR_PAYMENT_LINKS
    const foundingRadio = (html: string) => html.match(/<input[^>]*value="founding_sponsor"[^>]*>/)?.[0] ?? ''

    it('is not in the link list', () => {
      for (const link of SPONSOR_PAYMENT_LINKS) {
        expect(link.paymentLinkId).not.toBe(RETIRED_FOUNDING_LINK.id)
        expect(link.url).not.toBe(RETIRED_FOUNDING_LINK.url)
        expect(link.title).not.toContain('Founding')
      }
    })

    it('never comes back on live /sponsor, whichever founding Prices are set (a rollback shows no dead link)', async () => {
      for (const env of [
        { STRIPE_PRICE_FOUNDING_MONTHLY: undefined, STRIPE_PRICE_FOUNDING_SETUP: undefined },
        { STRIPE_PRICE_FOUNDING_MONTHLY: 'price_founding_monthly_test', STRIPE_PRICE_FOUNDING_SETUP: undefined },
        { STRIPE_PRICE_FOUNDING_MONTHLY: undefined, STRIPE_PRICE_FOUNDING_SETUP: 'price_founding_setup_test' },
        { STRIPE_PRICE_FOUNDING_MONTHLY: 'price_founding_monthly_test', STRIPE_PRICE_FOUNDING_SETUP: 'price_founding_setup_test' },
      ]) {
        const html = await pageHtml({ ...live, ...env })
        expect(html).not.toContain(RETIRED_FOUNDING_LINK.url)
        expect(html).not.toContain(RETIRED_FOUNDING_LINK.id)
        expect(html).not.toContain('Become a founding sponsor')
        expect(html).toContain(`href="${monthlyLink.url}"`)
        expect(html).toContain(SPONSOR_CANCEL_LINE)
        const configured = Boolean(env.STRIPE_PRICE_FOUNDING_MONTHLY && env.STRIPE_PRICE_FOUNDING_SETUP)
        expect(foundingRadio(html)).not.toBe('')
        expect(foundingRadio(html).includes('disabled')).toBe(!configured)
      }
    })
  })

  describe('price list gate', () => {
    const live = { VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey }
    const unset = {
      STRIPE_PRICE_PLACEMENT_SUBSCRIPTION: undefined,
      STRIPE_PRICE_FOUNDING_MONTHLY: undefined,
      STRIPE_PRICE_FOUNDING_SETUP: undefined,
    }
    const listItems = (html: string) => [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => (m[1] ?? '').replace(/<[^>]+>/g, ''))
    const subscriptionLine = (html: string) => listItems(html).filter((li) => li.startsWith('Featured placement, monthly subscription:'))
    const foundingLine = (html: string) => listItems(html).filter((li) => li.startsWith('Founding sponsor:'))
    const radio = (html: string, id: string) => html.match(new RegExp(`<input[^>]*value="${id}"[^>]*>`))?.[0] ?? ''

    it('leaves out the $299/mo and founding lines while their Prices are unset', async () => {
      for (const env of [live, { VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: testKey }, { VERCEL_ENV: 'production', STRIPE_SECRET_KEY: testKey }]) {
        const html = await pageHtml({ ...env, ...unset })
        expect(subscriptionLine(html)).toEqual([])
        expect(foundingLine(html)).toEqual([])
        expect(html).toContain('Featured placement: $299 for one month.')
        expect(html).toContain('Prices above are current.')
        expect(html).not.toContain('one-time and subscription')
      }
      const html = await pageHtml({ ...live, ...unset })
      // The Monthly Payment Link card (the only one left) and its terms still show on live production.
      expect(html).toContain(`href="${SPONSOR_PAYMENT_LINKS[0].url}"`)
      expect(html).toContain(SPONSOR_PAYMENT_LINKS[0].terms)
    })

    it('keeps the founding line out when only one founding Price is set, or a value is not a Price id', async () => {
      for (const env of [
        { STRIPE_PRICE_FOUNDING_MONTHLY: 'price_founding_monthly_test', STRIPE_PRICE_FOUNDING_SETUP: undefined },
        { STRIPE_PRICE_FOUNDING_MONTHLY: undefined, STRIPE_PRICE_FOUNDING_SETUP: 'price_founding_setup_test' },
        { STRIPE_PRICE_FOUNDING_MONTHLY: 'prod_not_a_price', STRIPE_PRICE_FOUNDING_SETUP: 'price_founding_setup_test' },
        { STRIPE_PRICE_FOUNDING_MONTHLY: ' ', STRIPE_PRICE_FOUNDING_SETUP: ' ' },
      ]) {
        const html = await pageHtml({ ...live, ...unset, ...env })
        expect(foundingLine(html)).toEqual([])
        expect(radio(html, 'founding_sponsor')).toContain('disabled')
      }
      const html = await pageHtml({ ...live, ...unset, STRIPE_PRICE_PLACEMENT_SUBSCRIPTION: 'sub_not_a_price' })
      expect(subscriptionLine(html)).toEqual([])
      // An unconfigured monthly subscription is left off the form entirely.
      expect(radio(html, 'placement_subscription')).toBe('')
    })

    it('lists each subscription line once its Prices are set, matching its radio', async () => {
      const subOnly = await pageHtml({ ...live, ...unset, STRIPE_PRICE_PLACEMENT_SUBSCRIPTION: 'price_subscription_test' })
      expect(subscriptionLine(subOnly)).toEqual([`Featured placement, monthly subscription: $299/mo. ${OFFERING_SUBSCRIPTION_NOTICE}`])
      expect(foundingLine(subOnly)).toEqual([])
      expect(radio(subOnly, 'placement_subscription')).not.toContain('disabled')
      expect(subOnly).toContain('Prices above, one-time and subscription, are current.')

      const both = await pageHtml({
        ...live,
        STRIPE_PRICE_PLACEMENT_SUBSCRIPTION: 'price_subscription_test',
        STRIPE_PRICE_FOUNDING_MONTHLY: 'price_founding_monthly_test',
        STRIPE_PRICE_FOUNDING_SETUP: 'price_founding_setup_test',
      })
      expect(subscriptionLine(both)).toHaveLength(1)
      expect(foundingLine(both)).toHaveLength(1)
      expect(foundingLine(both)[0]).toContain('Limited to 5 founding sponsors.')
      expect(radio(both, 'founding_sponsor')).not.toContain('disabled')
    })

    it('matches the radios for every combination of the three subscription Prices', async () => {
      const values = [undefined, '', 'price_ok_test', 'not_a_price']
      for (const sub of values)
        for (const monthly of values)
          for (const setup of values) {
            const html = await pageHtml({
              ...live,
              STRIPE_PRICE_PLACEMENT_SUBSCRIPTION: sub,
              STRIPE_PRICE_FOUNDING_MONTHLY: monthly,
              STRIPE_PRICE_FOUNDING_SETUP: setup,
            })
            // The subscription radio is either enabled with its line, or absent with no line.
            const subRadio = radio(html, 'placement_subscription')
            expect(subRadio).not.toContain('disabled')
            expect(subscriptionLine(html).length).toBe(subRadio ? 1 : 0)
            expect(foundingLine(html).length).toBe(radio(html, 'founding_sponsor').includes('disabled') ? 0 : 1)
          }
    })

    const allSet = {
      STRIPE_PRICE_PLACEMENT_SUBSCRIPTION: 'price_subscription_test',
      STRIPE_PRICE_FOUNDING_MONTHLY: 'price_founding_monthly_test',
      STRIPE_PRICE_FOUNDING_SETUP: 'price_founding_setup_test',
    }

    it('lists both lines on a preview with a test key once all three Prices are set, with enabled radios', async () => {
      const html = await pageHtml({ VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: testKey, ...allSet })
      expect(html).toContain('Stripe test mode')
      expect(foundingLine(html)).toEqual([
        `Founding sponsor: $99 for 2 weeks, then $299/mo. ${SPONSOR_FOUNDING_NOTICE} Limited to 5 founding sponsors.`,
      ])
      expect(subscriptionLine(html)).toEqual([`Featured placement, monthly subscription: $299/mo. ${OFFERING_SUBSCRIPTION_NOTICE}`])
      expect(radio(html, 'founding_sponsor')).not.toContain('disabled')
      expect(radio(html, 'placement_subscription')).not.toContain('disabled')
      expect(html).not.toContain(SPONSOR_PAYMENT_LINK_HOST)
    })

    it('on closed production lists the configured subscription line like the one-time prices, no founding line, no form and no radio', async () => {
      const closed = await pageHtml({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: testKey, ...allSet })
      expect(closed).not.toContain('Continue to checkout')
      expect(radio(closed, 'placement_subscription')).toBe('')
      expect(radio(closed, 'founding_sponsor')).toBe('')
      expect(subscriptionLine(closed)).toHaveLength(1)
      // The founding line is listed only where it can be bought (Sentinel P3-2 on #97).
      expect(foundingLine(closed)).toEqual([])
      expect(closed).not.toContain('Limited to 5')
      expect(closed).toContain('Featured placement: $299 for one month.')
      expect(closed).toContain('Prices above, one-time and subscription, are current.')
      const unsetClosed = await pageHtml({ VERCEL_ENV: 'production', STRIPE_SECRET_KEY: testKey, ...unset })
      expect(subscriptionLine(unsetClosed)).toEqual([])
      expect(foundingLine(unsetClosed)).toEqual([])
    })
  })

  describe('form options without configured Prices', () => {
    const live = { VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey }
    const option = (html: string, id: string) => {
      const start = html.indexOf(`value="${id}"`)
      if (start < 0) return ''
      const label = html.lastIndexOf('<label', start)
      return html.slice(label, html.indexOf('</label>', start)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    }

    it('hides an unconfigured monthly subscription and shows a disabled Founding option with no price or terms', async () => {
      const html = await pageHtml({
        ...live,
        STRIPE_PRICE_PLACEMENT_MONTHLY: 'price_month_test',
        STRIPE_PRICE_PLACEMENT_SUBSCRIPTION: undefined,
        STRIPE_PRICE_FOUNDING_MONTHLY: 'price_founding_monthly_test',
        STRIPE_PRICE_FOUNDING_SETUP: undefined,
      })
      expect(option(html, 'placement_subscription')).toBe('')
      expect(html).not.toContain('Featured placement, monthly subscription')
      expect(option(html, 'founding_sponsor')).toBe(`Founding sponsor ${SPONSOR_OFFERING_NOT_CONFIGURED}`)
      for (const id of ['placement_subscription', 'founding_sponsor']) {
        expect(option(html, id)).not.toContain('$')
        expect(option(html, id)).not.toContain('·')
      }
      // The rendered HTML has none of the hidden offers' terms. The client props are checked separately below.
      expect(html).not.toContain(OFFERING_SUBSCRIPTION_NOTICE)
      expect(html).not.toContain(SPONSOR_FOUNDING_NOTICE)
      // The one-time options keep their prices.
      expect(option(html, 'placement_monthly')).toContain('Featured placement for one month · $299')
      expect(option(html, 'placement_monthly')).not.toContain(SPONSOR_OFFERING_NOT_CONFIGURED)
    })

    it('shows the price and terms again once the option is configured', async () => {
      const html = await pageHtml({
        ...live,
        STRIPE_PRICE_PLACEMENT_SUBSCRIPTION: 'price_subscription_test',
        STRIPE_PRICE_FOUNDING_MONTHLY: 'price_founding_monthly_test',
        STRIPE_PRICE_FOUNDING_SETUP: 'price_founding_setup_test',
      })
      expect(option(html, 'placement_subscription')).toContain('Featured placement, monthly subscription · $299/mo')
      expect(option(html, 'placement_subscription')).toContain(OFFERING_SUBSCRIPTION_NOTICE)
      expect(option(html, 'founding_sponsor')).toContain('Founding sponsor · $99 for 2 weeks, then $299/mo')
      expect(option(html, 'founding_sponsor')).toContain(SPONSOR_FOUNDING_NOTICE)
      for (const id of ['placement_subscription', 'founding_sponsor']) {
        expect(option(html, id)).not.toContain(SPONSOR_OFFERING_NOT_CONFIGURED)
      }
    })
  })

  describe('offerings prop sent to the client SponsorForm', () => {
    const live = { VERCEL_ENV: 'production', STRIPE_ALLOW_LIVE: allowLive, STRIPE_SECRET_KEY: liveKey }

    /** Walks the element tree SponsorPage returns, without rendering, to the SponsorForm element's props. */
    async function formOfferings(env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): Promise<SponsorFormOffering[]> {
      await pageHtml(env)
      resetStripeCache()
      const found: SponsorFormOffering[][] = []
      const walk = (node: ReactNode): void => {
        if (Array.isArray(node)) return node.forEach(walk)
        if (!isValidElement(node)) return
        const props = node.props as { children?: ReactNode; offerings?: SponsorFormOffering[] }
        if (node.type === SponsorForm && props.offerings) found.push(props.offerings)
        walk(props.children)
      }
      walk(await SponsorPage())
      expect(found).toHaveLength(1)
      return found[0] ?? []
    }

    it('sends an empty summary, priceLabel and notice for every unavailable offering', async () => {
      const cases = [
        { ...live, STRIPE_PRICE_PLACEMENT_MONTHLY: 'price_month_test' },
        { ...live, STRIPE_PRICE_FOUNDING_MONTHLY: 'price_founding_monthly_test' },
        { VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: testKey, STRIPE_PRICE_PLACEMENT_SUBSCRIPTION: 'price_subscription_test' },
      ]
      for (const env of cases) {
        const offerings = await formOfferings(env)
        const unavailable = offerings.filter((offering) => !offering.available)
        expect(unavailable.map((offering) => offering.id)).toEqual(expect.arrayContaining(['founding_sponsor']))
        for (const offering of unavailable) {
          expect({ id: offering.id, summary: offering.summary, priceLabel: offering.priceLabel, notice: offering.notice }).toEqual({
            id: offering.id,
            summary: '',
            priceLabel: '',
            notice: '',
          })
          expect(offering.title).not.toBe('')
        }
      }
    })

    it('keeps the summary, priceLabel and notice for available offerings', async () => {
      const offerings = await formOfferings({
        ...live,
        STRIPE_PRICE_PLACEMENT_MONTHLY: 'price_month_test',
        STRIPE_PRICE_PLACEMENT_SUBSCRIPTION: 'price_subscription_test',
        STRIPE_PRICE_FOUNDING_MONTHLY: 'price_founding_monthly_test',
        STRIPE_PRICE_FOUNDING_SETUP: 'price_founding_setup_test',
      })
      const byId = Object.fromEntries(offerings.map((offering) => [offering.id, offering]))
      for (const id of ['placement_monthly', 'placement_subscription', 'founding_sponsor']) {
        expect(byId[id]?.available).toBe(true)
        expect(byId[id]?.summary).not.toBe('')
        expect(byId[id]?.priceLabel).not.toBe('')
        expect(byId[id]?.notice).not.toBe('')
      }
      expect(byId.founding_sponsor?.notice).toBe(SPONSOR_FOUNDING_NOTICE)
      expect(byId.placement_subscription?.priceLabel).toBe('$299/mo')
    })
  })
})

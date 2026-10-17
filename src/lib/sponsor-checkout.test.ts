import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SponsorForm } from '@/components/sponsor-form'
import {
  SPONSOR_BUSINESS_NAME,
  SPONSOR_COMPANY_PUBLISHED,
  SPONSOR_INTEGRATION_IDENTIFIER,
  SPONSOR_OFFERINGS,
  SPONSOR_ONE_TIME_NOTICE,
  sponsorPriceId,
  sponsorPriceLabel,
} from './sponsor-offerings'
import { parseSponsorCheckout, sponsorCheckoutParams, sponsorRateLimitMessage } from './sponsor-checkout'

const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000'
const env = {
  STRIPE_PRICE_PLACEMENT_WEEKLY: 'price_server_weekly',
  STRIPE_PRICE_PLACEMENT_MONTHLY: 'price_server_monthly',
  STRIPE_PRICE_NEWSLETTER_SLOT: 'price_server_issue',
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

function futureIssue(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 10)
}

describe('sponsor offerings', () => {
  it('uses the default one-time list prices', () => {
    expect(SPONSOR_OFFERINGS.map((offering) => [offering.priceEnv, offering.unitAmount, offering.lookupKey])).toEqual([
      ['STRIPE_PRICE_PLACEMENT_WEEKLY', 9_900, 'sponsor_best_placement_weekly'],
      ['STRIPE_PRICE_PLACEMENT_MONTHLY', 29_900, 'sponsor_best_placement_monthly'],
      ['STRIPE_PRICE_NEWSLETTER_SLOT', 4_900, 'sponsor_newsletter_issue'],
    ])
    expect(SPONSOR_OFFERINGS.map((offering) => sponsorPriceLabel(offering.unitAmount))).toEqual(['$99', '$299', '$49'])
    expect(SPONSOR_ONE_TIME_NOTICE).toBe('One-time payment, no auto-renewal.')
    expect(SPONSOR_BUSINESS_NAME).toBe('BestBotFor')
    expect(SPONSOR_BUSINESS_NAME.length).toBeLessThanOrEqual(22)
    expect(SPONSOR_BUSINESS_NAME).toMatch(/^[A-Za-z0-9 ]+$/)
  })
})

describe('sponsorRateLimitMessage', () => {
  it('names a full window and a limiter failure separately', () => {
    expect(sponsorRateLimitMessage('limit')).toBe('Too many checkout attempts. Try again in an hour.')
    expect(sponsorRateLimitMessage('unavailable')).toBe('Checkout is temporarily unavailable. Try again.')
  })
})

describe('parseSponsorCheckout', () => {
  it('uses the server price id and ignores a client amount', () => {
    const parsed = parseSponsorCheckout(
      form({
        offering: 'placement_monthly',
        email: 'sponsor@example.com',
        company: 'Example Tools',
        task_slug: 'coding',
        request_id: REQUEST_ID,
        amount: '1',
        unit_amount: '99',
        price: 'price_from_browser',
      }),
      env,
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.priceId).toBe('price_server_monthly')
    expect(parsed.value.taskSlug).toBe('coding')
    expect(sponsorPriceId('placement_monthly', { STRIPE_PRICE_PLACEMENT_MONTHLY: 'not-a-price' })).toBeNull()
  })

  it('requires an issue date for a newsletter slot', () => {
    const missing = parseSponsorCheckout(
      form({
        offering: 'newsletter_slot',
        email: 'sponsor@example.com',
        company: 'Example Tools',
        request_id: REQUEST_ID,
      }),
      env,
    )
    expect(missing).toEqual({ ok: false, message: 'Choose the newsletter issue date.' })

    const parsed = parseSponsorCheckout(
      form({
        offering: 'newsletter_slot',
        email: 'sponsor@example.com',
        company: 'Example Tools',
        issue_date: futureIssue(21),
        request_id: REQUEST_ID,
      }),
      env,
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.priceId).toBe('price_server_issue')
    expect(parsed.value.issueDate).toBe(futureIssue(21))
  })

  it('strips bidi and control characters from the company name', () => {
    const parsed = parseSponsorCheckout(
      form({
        offering: 'placement_weekly',
        email: 'sponsor@example.com',
        company: '\u202EExample\u0007 Tools\u2069',
        task_slug: 'coding',
        request_id: REQUEST_ID,
      }),
      env,
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.company).toBe('Example Tools')
    const session = sponsorCheckoutParams({
      ...parsed.value,
      successUrl: 'https://bestbotfor.com/sponsor/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://bestbotfor.com/sponsor/cancel',
    })
    expect(session.params.metadata).toMatchObject({ company: 'Example Tools' })
    expect(JSON.stringify(session.params.metadata)).not.toContain('\u202E')

    const strippedBare = parseSponsorCheckout(
      form({
        offering: 'placement_weekly',
        email: 'sponsor@example.com',
        company: '\u202EA',
        task_slug: 'coding',
        request_id: REQUEST_ID,
      }),
      env,
    )
    expect(strippedBare).toEqual({ ok: false, message: 'Enter the company name.' })

    const accented = parseSponsorCheckout(
      form({
        offering: 'placement_weekly',
        email: 'sponsor@example.com',
        company: 'Café Tools',
        task_slug: 'coding',
        request_id: REQUEST_ID,
      }),
      env,
    )
    expect(accented.ok).toBe(true)
    if (!accented.ok) return
    expect(accented.value.company).toBe('Café Tools')
  })
})

describe('sponsor company publication copy', () => {
  it('tells the buyer their company name is published with a Sponsored label', () => {
    expect(SPONSOR_COMPANY_PUBLISHED).toBe('Your company name is published with a Sponsored label.')
    const html = renderToStaticMarkup(createElement(SponsorForm, { offerings: [], tasks: [] }))
    expect(html).toContain(SPONSOR_COMPANY_PUBLISHED)
  })
})

describe('sponsorCheckoutParams', () => {
  it('creates a one-time hosted session and replays the same body', () => {
    const parsed = parseSponsorCheckout(
      form({
        offering: 'placement_weekly',
        email: 'sponsor@example.com',
        company: 'Example Tools',
        task_slug: 'writing',
        request_id: REQUEST_ID,
      }),
      env,
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const first = sponsorCheckoutParams({
      ...parsed.value,
      successUrl: 'https://bestbotfor.com/sponsor/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://bestbotfor.com/sponsor/cancel',
    })
    const second = sponsorCheckoutParams({
      ...parsed.value,
      successUrl: 'https://bestbotfor.com/sponsor/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://bestbotfor.com/sponsor/cancel',
    })
    expect(first.params.mode).toBe('payment')
    expect(first.params.line_items).toEqual([{ price: 'price_server_weekly', quantity: 1 }])
    expect(JSON.stringify(first.params)).not.toContain('payment_method_types')
    expect(JSON.stringify(first.params)).not.toContain('unit_amount')
    expect(first.params.metadata).toMatchObject({
      kind: 'sponsorship',
      email: 'sponsor@example.com',
      company: 'Example Tools',
      task_slug: 'writing',
      price_id: 'price_server_weekly',
    })
    expect(SPONSOR_INTEGRATION_IDENTIFIER).toMatch(/^sponsor_checkout_[a-z]{8}$/)
    expect(first.params.integration_identifier).toBe(SPONSOR_INTEGRATION_IDENTIFIER)
    expect(first.params.payment_intent_data).toMatchObject({
      statement_descriptor_suffix: 'BestBotFor',
    })
    expect(first.params.payment_intent_data).not.toHaveProperty('statement_descriptor')
    expect(first.params.custom_text).toEqual({
      submit: { message: 'One-time payment, no auto-renewal.' },
    })
    expect(first.params.managed_payments).toEqual({ enabled: false })
    expect(first.params).not.toHaveProperty('automatic_tax')
    expect(first).toEqual(second)

    const otherOrigin = sponsorCheckoutParams({
      ...parsed.value,
      successUrl: 'http://127.0.0.1:3000/sponsor/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'http://127.0.0.1:3000/sponsor/cancel',
    })
    expect(otherOrigin.idempotencyKey).not.toBe(first.idempotencyKey)
    expect(otherOrigin.params.success_url).toBe('http://127.0.0.1:3000/sponsor/success?session_id={CHECKOUT_SESSION_ID}')
    expect(otherOrigin.params.cancel_url).toBe('http://127.0.0.1:3000/sponsor/cancel')
  })
})

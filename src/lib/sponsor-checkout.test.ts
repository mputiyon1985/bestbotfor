import { describe, expect, it } from 'vitest'
import { SPONSOR_OFFERINGS, sponsorPriceId, sponsorPriceLabel } from './sponsor-offerings'
import { parseSponsorCheckout, sponsorCheckoutParams } from './sponsor-checkout'

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
})

describe('sponsorCheckoutParams', () => {
  it('creates a one-time hosted session without a client price', () => {
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
    expect(first.params.integration_identifier).toMatch(/^sponsor_checkout_[a-z]{8}$/)
    expect(first.idempotencyKey).toBe(second.idempotencyKey)
    expect(first.params.integration_identifier).not.toBe(second.params.integration_identifier)
  })
})

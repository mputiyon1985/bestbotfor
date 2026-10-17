import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { verifyPaidSponsorCheckout } from './sponsor-session'

function stripeWith(session: Record<string, unknown> | null, fails = false): Stripe {
  return {
    checkout: {
      sessions: {
        retrieve: vi.fn(async () => {
          if (fails) throw new Error('no such session')
          return session
        }),
      },
    },
  } as unknown as Stripe
}

const paid = {
  id: 'cs_test_paid',
  payment_status: 'paid',
  mode: 'payment',
  metadata: {
    kind: 'sponsorship',
    offering: 'placement_weekly',
    task_slug: 'coding',
  },
}

describe('verifyPaidSponsorCheckout', () => {
  it('accepts a paid placement session and refuses anything else', async () => {
    const ok = await verifyPaidSponsorCheckout(stripeWith(paid), 'cs_test_paid')
    expect(ok).toEqual({
      ok: true,
      checkout: { sessionId: 'cs_test_paid', offering: 'placement_weekly', taskSlug: 'coding' },
    })
    const unpaid = await verifyPaidSponsorCheckout(stripeWith({ ...paid, payment_status: 'unpaid' }), 'cs_test_paid')
    expect(unpaid.ok).toBe(false)
    const newsletter = await verifyPaidSponsorCheckout(
      stripeWith({ ...paid, metadata: { ...paid.metadata, offering: 'newsletter_slot', task_slug: '' } }),
      'cs_test_paid',
    )
    expect(newsletter.ok).toBe(false)
    const mismatch = await verifyPaidSponsorCheckout(stripeWith({ ...paid, id: 'cs_test_other' }), 'cs_test_paid')
    expect(mismatch.ok).toBe(false)
    const missing = await verifyPaidSponsorCheckout(stripeWith(null, true), 'cs_test_paid')
    expect(missing.ok).toBe(false)
    const query = await verifyPaidSponsorCheckout(stripeWith(paid), 'cs_test_paid?url=https://evil.example')
    expect(query.ok).toBe(false)
  })
})

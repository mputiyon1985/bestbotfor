import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { sponsorships } from './db/schema'
import { createTestDatabase } from '@/test/db'
import {
  SPONSOR_CHECKOUT_EXPIRY_MS,
  SPONSOR_SLOT_TAKEN,
  claimSponsorSlot,
  releaseSponsorSlot,
} from './sponsor-availability'

const NOW = 1_700_000_000_000
const WEEK = 7 * 24 * 60 * 60 * 1000

describe('sponsor slot claims', () => {
  it('refuses an overlapping paid placement and allows a refund, an ended window, and another task', async () => {
    const { db, close } = await createTestDatabase()
    await db.insert(sponsorships).values({
      stripeCheckoutSessionId: 'cs_live',
      offering: 'placement_weekly',
      status: 'paid',
      taskSlug: 'coding',
      createdAt: NOW,
      updatedAt: NOW,
      paidAt: NOW,
    })
    const blocked = await claimSponsorSlot(db, {
      taskSlug: 'coding',
      offering: 'placement_monthly',
      requestKey: 'req-blocked',
      now: NOW + 1,
    })
    expect(blocked).toEqual({ ok: false, message: SPONSOR_SLOT_TAKEN })

    await db.insert(sponsorships).values({
      stripeCheckoutSessionId: 'cs_refunded',
      offering: 'placement_weekly',
      status: 'paid',
      taskSlug: 'writing',
      createdAt: NOW,
      updatedAt: NOW,
      paidAt: NOW,
      refundedAt: NOW,
    })
    const refunded = await claimSponsorSlot(db, {
      taskSlug: 'writing',
      offering: 'placement_weekly',
      requestKey: 'req-refunded',
      now: NOW,
    })
    expect(refunded.ok).toBe(true)

    await db.insert(sponsorships).values({
      stripeCheckoutSessionId: 'cs_ended',
      offering: 'placement_weekly',
      status: 'paid',
      taskSlug: 'design',
      createdAt: NOW - WEEK - 1,
      updatedAt: NOW - WEEK - 1,
      paidAt: NOW - WEEK - 1,
    })
    const ended = await claimSponsorSlot(db, {
      taskSlug: 'design',
      offering: 'placement_weekly',
      requestKey: 'req-ended',
      now: NOW,
    })
    expect(ended.ok).toBe(true)

    const other = await claimSponsorSlot(db, {
      taskSlug: 'music',
      offering: 'placement_weekly',
      requestKey: 'req-music',
      now: NOW,
    })
    expect(other.ok).toBe(true)
    await close()
  })

  it('keeps one live claim, lets the same request retry, and takes over an expired claim', async () => {
    const { db, close } = await createTestDatabase()
    const first = await claimSponsorSlot(db, {
      taskSlug: 'coding',
      offering: 'placement_weekly',
      requestKey: 'req-a',
      now: NOW,
    })
    const second = await claimSponsorSlot(db, {
      taskSlug: 'coding',
      offering: 'placement_weekly',
      requestKey: 'req-b',
      now: NOW + 1,
    })
    const retry = await claimSponsorSlot(db, {
      taskSlug: 'coding',
      offering: 'placement_monthly',
      requestKey: 'req-a',
      now: NOW + 2,
    })
    expect(first.ok).toBe(true)
    expect(second).toEqual({ ok: false, message: SPONSOR_SLOT_TAKEN })
    expect(retry.ok).toBe(true)

    const [left, right] = await Promise.all([
      claimSponsorSlot(db, { taskSlug: 'video', offering: 'placement_weekly', requestKey: 'req-left', now: NOW }),
      claimSponsorSlot(db, { taskSlug: 'video', offering: 'placement_weekly', requestKey: 'req-right', now: NOW }),
    ])
    expect([left.ok, right.ok].filter(Boolean)).toHaveLength(1)

    const expired = await claimSponsorSlot(db, {
      taskSlug: 'coding',
      offering: 'placement_weekly',
      requestKey: 'req-next',
      now: NOW + 2 + SPONSOR_CHECKOUT_EXPIRY_MS + 1,
    })
    expect(expired.ok).toBe(true)
    await releaseSponsorSlot(db, { taskSlug: 'music', requestKey: 'req-other' })
    await releaseSponsorSlot(db, { taskSlug: 'coding', requestKey: 'req-next' })
    const afterRelease = await claimSponsorSlot(db, {
      taskSlug: 'coding',
      offering: 'placement_weekly',
      requestKey: 'req-fresh',
      now: NOW + 2 + SPONSOR_CHECKOUT_EXPIRY_MS + 2,
    })
    expect(afterRelease.ok).toBe(true)

    const source = readFileSync(path.join(process.cwd(), 'src/app/sponsor/actions.ts'), 'utf8')
    expect(source).toContain('claimSponsorSlot(')
    expect(source).toContain('releaseSponsorSlot(')
    expect(source).toContain('verifyPaidSponsorCheckout(')
    expect(source).not.toMatch(/\bdb\.(?:insert|update|delete)\s*\(/)
    await close()
  })
})

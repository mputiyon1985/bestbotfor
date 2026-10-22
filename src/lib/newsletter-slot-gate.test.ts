import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { subscribers } from './db/schema'
import { countSyncedSubscribers } from './newsletter'
import { newsletterSlotAvailable, newsletterSlotOpen } from './newsletter-slot-gate'
import { PENDING_SUBSCRIBER_STATUS, SYNCED_SUBSCRIBER_STATUS } from './newsletter-status'
import { createTestDatabase } from '@/test/db'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

describe('newsletter slot gate', () => {
  it('opens only with at least one synced subscriber', () => {
    expect(newsletterSlotOpen(0)).toBe(false)
    expect(newsletterSlotOpen(1)).toBe(true)
    expect(newsletterSlotOpen(Number.NaN)).toBe(false)
  })
  it('fails closed on a read error', async () => {
    expect(await newsletterSlotAvailable(async () => { throw new Error('db down') })).toBe(false)
    expect(await newsletterSlotAvailable(async () => 3)).toBe(true)
  })
  // Visible state (Sentinel P3 on #136). The e2e server shares one Next data cache across
  // its servers, so a synced row there would leak into the hidden-state sponsor test.
  // This drives the gate from a real migrated database instead.
  it('opens once the database has a synced subscriber, and not for pending ones', async () => {
    const { db, close } = await createTestDatabase()
    try {
      const read = () => countSyncedSubscribers(db)
      expect(await newsletterSlotAvailable(read)).toBe(false)
      await db.insert(subscribers).values({
        email: 'pending@example.com',
        destination: 'local',
        status: PENDING_SUBSCRIBER_STATUS,
        createdAt: 1_000,
      })
      expect(await newsletterSlotAvailable(read)).toBe(false)
      await db.insert(subscribers).values({
        email: 'synced@example.com',
        destination: 'beehiiv',
        beehiivId: 'sub_synced',
        status: SYNCED_SUBSCRIBER_STATUS,
        createdAt: 2_000,
      })
      expect(await newsletterSlotAvailable(read)).toBe(true)
    } finally {
      await close()
    }
  })
  it('the sponsor page lists the newsletter slot whenever the gate is open', () => {
    const page = read('src/app/sponsor/page.tsx')
    expect(page).toContain('const newsletterOpen = await newsletterSlotAvailable()')
    expect(page).toContain("newsletterOpen || offering.id !== 'newsletter_slot'")
  })
  it('the checkout action refuses the newsletter slot while it is hidden', () => {
    const action = read('src/app/sponsor/actions.ts')
    expect(action).toContain("parsed.value.offering === 'newsletter_slot' && !(await newsletterSlotAvailable())")
  })
})

describe('sponsor page copy', () => {
  const page = read('src/app/sponsor/page.tsx')
  it('drops internal wording', () => {
    expect(page).not.toContain('server configuration')
    expect(page).not.toContain('configured on the server')
    expect(read('src/lib/sponsor-form-copy.ts')).not.toContain('not configured yet')
  })
  it('pitches the founding offer as a discounted founding test', () => {
    expect(page).toContain('The founding offer is a discounted founding test')
  })
})

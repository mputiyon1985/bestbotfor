import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { decideAdminStepUp } from './admin'
import { sponsorshipCreatives, sponsorshipReviewEvents, sponsorships } from './db/schema'
import { createTestDatabase } from '@/test/db'
import {
  SPONSOR_REFUND_NOTE,
  listPendingSponsorCards,
  parseSponsorCardFields,
  parseSponsorHttpsUrl,
  parseSponsorLogo,
  recordSponsorCardReview,
  reviewSponsorCardIfAllowed,
  savePendingSponsorCard,
  toPublicSponsorCard,
} from './sponsor-card'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const NOW = 1_700_000_000_000

function fields(overrides: Partial<Parameters<typeof parseSponsorCardFields>[0]> = {}) {
  return {
    toolName: 'Widget',
    description: 'A useful coding tool.',
    url: 'https://example.com/widget',
    logoMime: 'image/png',
    logoBytes: PNG,
    ...overrides,
  }
}

describe('sponsor card validation', () => {
  it('accepts a https card and strips bidi and control characters', () => {
    const parsed = parseSponsorCardFields(
      fields({ toolName: '\u202ECafé\u0000', description: 'A useful\u200F coding tool.' }),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.card.toolName).toBe('Café')
    expect(parsed.card.description).toBe('A useful coding tool.')
    expect(parsed.card.url).toBe('https://example.com/widget')
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00])
    expect(parseSponsorLogo('image/jpeg', jpeg)?.mime).toBe('image/jpeg')
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])
    expect(parseSponsorLogo('image/webp', webp)?.mime).toBe('image/webp')
  })

  it('rejects bad lengths, urls, markup, and logos', () => {
    expect(parseSponsorCardFields(fields({ toolName: 'A' })).ok).toBe(false)
    expect(parseSponsorCardFields(fields({ toolName: 'A'.repeat(61) })).ok).toBe(false)
    expect(parseSponsorCardFields(fields({ description: 'Too short' })).ok).toBe(false)
    expect(parseSponsorCardFields(fields({ description: 'A'.repeat(141) })).ok).toBe(false)
    expect(parseSponsorCardFields(fields({ toolName: '<Widget>' })).ok).toBe(false)
    expect(parseSponsorCardFields(fields({ description: 'A <b>useful</b> tool' })).ok).toBe(false)
    expect(parseSponsorHttpsUrl('http://example.com/widget')).toBeNull()
    expect(parseSponsorHttpsUrl('https://user:pass@example.com/widget')).toBeNull()
    expect(parseSponsorHttpsUrl('https://localhost/widget')).toBeNull()
    expect(parseSponsorHttpsUrl('https://tools.localhost/widget')).toBeNull()
    expect(parseSponsorHttpsUrl('javascript:alert(1)')).toBeNull()
    expect(parseSponsorHttpsUrl('https://example.com/a b')).toBeNull()
    expect(parseSponsorLogo('image/svg+xml', Buffer.from('<svg></svg>'))).toBeNull()
    expect(parseSponsorLogo('image/png', Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0]))).toBeNull()
    expect(parseSponsorLogo('image/png', Buffer.alloc(8))).toBeNull()
    const huge = Buffer.alloc(200 * 1024 + 1)
    huge[0] = 0x89
    huge[1] = 0x50
    huge[2] = 0x4e
    huge[3] = 0x47
    expect(parseSponsorLogo('image/png', huge)).toBeNull()
    expect(
      toPublicSponsorCard({
        status: 'pending',
        toolName: 'Widget',
        description: 'A useful coding tool.',
        url: 'https://example.com/widget',
        logoMime: 'image/png',
        logoBytes: PNG,
      }),
    ).toBeNull()
  })
})

describe('pending sponsor card storage', () => {
  it('updates the same checkout request instead of inserting a second card', async () => {
    const { db, close } = await createTestDatabase()
    const parsed = parseSponsorCardFields(fields())
    if (!parsed.ok) throw new Error('card')
    const first = await savePendingSponsorCard(db, { requestKey: 'req-1', card: parsed.card, now: NOW })
    const second = await savePendingSponsorCard(db, { requestKey: 'req-1', card: parsed.card, now: NOW + 1 })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.id).toBe(first.id)
    expect(await db.select().from(sponsorshipCreatives)).toHaveLength(1)
    await close()
  })
})

describe('sponsor card review', () => {
  it('writes nothing unless the step-up decision allows the admin', async () => {
    const { db, close } = await createTestDatabase()
    const creative = await insertPending(db)
    const allowlist = new Set(['user_admin'])
    const denied = [
      decideAdminStepUp({ userId: null, role: null, twoFactorEnabled: false, factorVerificationAge: null }, allowlist),
      decideAdminStepUp(
        { userId: 'user_member', role: 'admin', twoFactorEnabled: true, factorVerificationAge: [1, 1] },
        allowlist,
      ),
      decideAdminStepUp(
        { userId: 'user_admin', role: 'admin', twoFactorEnabled: false, factorVerificationAge: [1, 1] },
        allowlist,
      ),
      decideAdminStepUp(
        { userId: 'user_admin', role: 'admin', twoFactorEnabled: true, factorVerificationAge: [10, 1] },
        allowlist,
      ),
    ]
    for (const access of denied) {
      expect(access.ok).toBe(false)
      const result = await reviewSponsorCardIfAllowed(db, access, {
        creativeId: creative,
        decision: 'approved',
        reason: '',
        now: NOW,
      })
      expect(result.ok).toBe(false)
    }
    expect(await db.select().from(sponsorshipReviewEvents)).toHaveLength(0)
    const still = await db.select().from(sponsorshipCreatives)
    expect(still[0]?.status).toBe('pending')
    await close()
  })

  it('appends an audit row for approve and reject and refuses a second decision', async () => {
    const { db, url, close } = await createTestDatabase()
    const creative = await insertPending(db)
    const approved = await recordSponsorCardReview(db, {
      actorId: 'user_admin',
      creativeId: creative,
      decision: 'approved',
      reason: '',
      now: NOW,
    })
    expect(approved).toEqual({ ok: true })
    const again = await recordSponsorCardReview(db, {
      actorId: 'user_admin',
      creativeId: creative,
      decision: 'rejected',
      reason: 'Changed our mind',
      now: NOW + 1,
    })
    expect(again.ok).toBe(false)
    const approvedRows = await db.select().from(sponsorshipReviewEvents)
    expect(approvedRows).toHaveLength(1)
    expect(approvedRows[0]).toMatchObject({
      actor: 'user_admin',
      decision: 'approved',
      reason: 'Approved.',
      createdAt: NOW,
    })

    const rejectedId = await insertPending(db, 'cs_reject')
    const missing = await recordSponsorCardReview(db, {
      actorId: 'user_admin',
      creativeId: rejectedId,
      decision: 'rejected',
      reason: 'No',
      now: NOW,
    })
    expect(missing.ok).toBe(false)
    const rejected = await recordSponsorCardReview(db, {
      actorId: '\u202Euser_admin',
      creativeId: rejectedId,
      decision: 'rejected',
      reason: 'Off topic claim',
      now: NOW + 2,
    })
    expect(rejected).toEqual({ ok: true })
    const events = await db.select().from(sponsorshipReviewEvents)
    expect(events).toHaveLength(2)
    expect(events.find((row) => row.decision === 'rejected')).toMatchObject({
      actor: 'user_admin',
      decision: 'rejected',
      reason: 'Off topic claim',
      createdAt: NOW + 2,
    })

    const client = createClient({ url })
    await expect(client.execute('UPDATE sponsorship_review_events SET reason = \'changed\'')).rejects.toThrow(/append-only/)
    await expect(client.execute('DELETE FROM sponsorship_review_events')).rejects.toThrow(/append-only/)
    client.close()
    await close()
  })

  it('lists only paid, unrefunded, pending cards and does not refund from code', async () => {
    const { db, close } = await createTestDatabase()
    const paid = await insertSponsorship(db, { session: 'cs_paid', status: 'paid' })
    const refunded = await insertSponsorship(db, { session: 'cs_refunded', status: 'paid', refundedAt: NOW })
    const unpaid = await insertSponsorship(db, { session: 'cs_pending', status: 'pending' })
    await insertCreative(db, paid, 'pending')
    await insertCreative(db, refunded, 'pending')
    await insertCreative(db, unpaid, 'pending')
    const queue = await listPendingSponsorCards(db)
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ company: 'Example Tools', taskSlug: 'coding', offering: 'placement_weekly', name: 'Widget' })
    expect(queue[0]).not.toHaveProperty('email')
    expect(JSON.stringify(queue)).not.toContain('sponsor@example.com')

    const reviewSource = readFileSync(path.join(process.cwd(), 'src/lib/sponsor-card.ts'), 'utf8')
    const actionSource = readFileSync(path.join(process.cwd(), 'src/app/admin/sponsor-cards/actions.ts'), 'utf8')
    const pageSource = readFileSync(path.join(process.cwd(), 'src/app/admin/sponsor-cards/page.tsx'), 'utf8')
    expect(reviewSource).not.toContain('refunds.create')
    expect(reviewSource).not.toContain('stripe.refunds')
    expect(actionSource).not.toContain('refunds.create')
    expect(actionSource).toContain('requireAdminStepUp(')
    expect(actionSource).not.toMatch(/\.(?:insert|update|delete)\s*\(/)
    expect(pageSource).toContain('requireAdmin(')
    const queueSource = readFileSync(path.join(process.cwd(), 'src/components/sponsor-card-queue.tsx'), 'utf8')
    expect(queueSource).toContain('{SPONSOR_REFUND_NOTE}')
    expect(SPONSOR_REFUND_NOTE).toBe(
      'Refunds are done in the Stripe dashboard. Rejecting a card does not refund the payment.',
    )
    await close()
  })
})

async function insertSponsorship(
  db: Awaited<ReturnType<typeof createTestDatabase>>['db'],
  input: { session: string; status: string; refundedAt?: number },
) {
  const rows = await db
    .insert(sponsorships)
    .values({
      stripeCheckoutSessionId: input.session,
      offering: 'placement_weekly',
      status: input.status,
      company: 'Example Tools',
      email: 'sponsor@example.com',
      taskSlug: 'coding',
      createdAt: NOW,
      updatedAt: NOW,
      paidAt: input.status === 'paid' ? NOW : null,
      refundedAt: input.refundedAt ?? null,
    })
    .returning({ id: sponsorships.id })
  const id = rows[0]?.id
  if (!id) throw new Error('missing sponsorship')
  return id
}

async function insertCreative(
  db: Awaited<ReturnType<typeof createTestDatabase>>['db'],
  sponsorshipId: number,
  status: string,
) {
  await db.insert(sponsorshipCreatives).values({
    sponsorshipId,
    requestKey: `card-${sponsorshipId}-${status}`,
    toolName: 'Widget',
    description: 'A useful coding tool.',
    url: 'https://example.com/widget',
    logoMime: 'image/png',
    logoBytes: PNG,
    status,
    createdAt: NOW,
    updatedAt: NOW,
  })
}

async function insertPending(db: Awaited<ReturnType<typeof createTestDatabase>>['db'], session = 'cs_paid') {
  const sponsorshipId = await insertSponsorship(db, { session, status: 'paid' })
  const rows = await db
    .insert(sponsorshipCreatives)
    .values({
      sponsorshipId,
      requestKey: `pending-${session}`,
      toolName: 'Widget',
      description: 'A useful coding tool.',
      url: 'https://example.com/widget',
      logoMime: 'image/png',
      logoBytes: PNG,
      status: 'pending',
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning({ id: sponsorshipCreatives.id })
  const id = rows[0]?.id
  if (!id) throw new Error('missing creative')
  return id
}

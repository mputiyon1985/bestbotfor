import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { decideAdminStepUp } from './admin'
import { sponsorshipCreatives, sponsorshipRefundEvents, sponsorshipReviewEvents, sponsorships } from './db/schema'
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
  saveSponsorCardForSession,
  sponsorCardContentHash,
  SPONSOR_CARD_CHANGED,
  SPONSOR_RESUBMIT_CLOSED,
  toPublicSponsorCard,
  expireSponsorResubmissions,
  markSponsorRefunded,
} from './sponsor-card'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const NOW = 1_700_000_000_000
const WEEK = 7 * 24 * 60 * 60 * 1000
const HASH = sponsorCardContentHash({
  toolName: 'Widget',
  description: 'A useful coding tool.',
  url: 'https://example.com/widget',
  logoMime: 'image/png',
  logoBytes: PNG,
})
const REVIEW = { version: 1, updatedAt: NOW, contentHash: HASH }

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
    const normalized = parseSponsorCardFields(fields({ toolName: '\uFF37idget', description: 'A useful\u200D coding tool.' }))
    expect(normalized.ok).toBe(true)
    if (!normalized.ok) return
    expect(normalized.card.toolName).toBe('Widget')
    expect(normalized.card.description).toContain('\u200D')
    expect(normalized.card.hadInvisible).toBe(true)
    const stripped = parseSponsorCardFields(fields({ description: 'A useful\u200B coding tool.' }))
    expect(stripped.ok).toBe(true)
    if (!stripped.ok) return
    expect(stripped.card.description).toBe('A useful coding tool.')
    expect(stripped.card.hadInvisible).toBe(true)
    const withText = pngWithTextChunk(PNG)
    const cleaned = parseSponsorLogo('image/png', withText)
    expect(cleaned?.bytes.includes(Buffer.from('tEXt'))).toBe(false)
    expect(cleaned?.bytes.subarray(0, 8)).toEqual(PNG.subarray(0, 8))
    expect(parsed.card.url).toBe('https://example.com/widget')
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
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
    expect(parseSponsorHttpsUrl('https://127.0.0.1/widget')).toBeNull()
    expect(parseSponsorHttpsUrl('https://10.1.2.3/widget')).toBeNull()
    expect(parseSponsorHttpsUrl('https://192.168.0.5/widget')).toBeNull()
    expect(parseSponsorHttpsUrl('https://[::1]/widget')).toBeNull()
    expect(parseSponsorHttpsUrl('https://files.internal/widget')).toBeNull()
    expect(parseSponsorHttpsUrl('https://printer.local/widget')).toBeNull()
    expect(parseSponsorHttpsUrl('javascript:alert(1)')).toBeNull()
    expect(parseSponsorHttpsUrl('https://example.com/a b')).toBeNull()
    expect(parseSponsorLogo('image/svg+xml', Buffer.from('<svg></svg>'))).toBeNull()
    expect(parseSponsorLogo('image/png', Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0]))).toBeNull()
    expect(parseSponsorLogo('image/png', Buffer.alloc(8))).toBeNull()
    const huge = Buffer.alloc(64 * 1024 + 1)
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
        ...REVIEW,
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
      ...REVIEW,
    })
    expect(approved).toEqual({ ok: true })
    const again = await recordSponsorCardReview(db, {
      actorId: 'user_admin',
      creativeId: creative,
      decision: 'rejected',
      reason: 'Changed our mind',
      now: NOW + 1,
      ...REVIEW,
    })
    expect(again.ok).toBe(false)
    const approvedRows = await db.select().from(sponsorshipReviewEvents)
    expect(approvedRows).toHaveLength(1)
    expect(approvedRows[0]).toMatchObject({
      actor: 'user_admin',
      decision: 'approved',
      reason: 'Approved.',
      contentHash: HASH,
      version: 1,
      createdAt: NOW,
    })

    const rejectedId = await insertPending(db, 'cs_reject')
    const missing = await recordSponsorCardReview(db, {
      actorId: 'user_admin',
      creativeId: rejectedId,
      decision: 'rejected',
      reason: 'No',
      now: NOW,
      ...REVIEW,
    })
    expect(missing.ok).toBe(false)
    const rejected = await recordSponsorCardReview(db, {
      actorId: '\u202Euser_admin',
      creativeId: rejectedId,
      decision: 'rejected',
      reason: 'Off topic claim',
      now: NOW + 2,
      ...REVIEW,
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
    await expect(
      client.execute(
        "INSERT OR REPLACE INTO sponsorship_review_events (id, creative_id, actor, decision, reason, created_at) VALUES (1, 1, 'x', 'approved', 'Approved.', 1)",
      ),
    ).rejects.toThrow(/append-only/)
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
    expect(queueSource).toContain('content_hash')
    expect(queueSource).toContain('{SPONSOR_INVISIBLE_WARNING}')
    expect(queueSource).toContain('{SPONSOR_REFUND_NOTE}')
    expect(SPONSOR_REFUND_NOTE).toBe(
      'Refunds are done in the Stripe dashboard. Rejecting a card does not refund the payment.',
    )
    await close()
  })

  it('refuses a stale version and lets only one of two concurrent decisions win', async () => {
    const { db, close } = await createTestDatabase()
    const creative = await insertPending(db)
    const stale = await recordSponsorCardReview(db, {
      actorId: 'user_admin',
      creativeId: creative,
      decision: 'approved',
      reason: '',
      now: NOW,
      ...REVIEW,
      contentHash: 'b'.repeat(64),
    })
    expect(stale).toEqual({ ok: false, message: SPONSOR_CARD_CHANGED })
    expect(await db.select().from(sponsorshipReviewEvents)).toHaveLength(0)

    const [approved, rejected] = await Promise.all([
      recordSponsorCardReview(db, {
        actorId: 'user_admin',
        creativeId: creative,
        decision: 'approved',
        reason: '',
        now: NOW,
        ...REVIEW,
      }),
      recordSponsorCardReview(db, {
        actorId: 'user_other',
        creativeId: creative,
        decision: 'rejected',
        reason: 'Not this version',
        now: NOW,
        ...REVIEW,
      }),
    ])
    const results = [approved, rejected]
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(await db.select().from(sponsorshipReviewEvents)).toHaveLength(1)
    const row = await db.select().from(sponsorshipCreatives)
    expect(['approved', 'rejected']).toContain(row[0]?.status)
    if (row[0]?.status === 'approved') {
      expect(row[0]?.approvedContentHash).toBe(HASH)
      expect(row[0]?.approvedToolName).toBe('Widget')
    }
    await close()
  })

  it('allows one resubmission within 7 days, then refund_pending, and audits the dashboard mark', async () => {
    const { db, close } = await createTestDatabase()
    const creative = await insertPending(db, 'cs_resubmit')
    const rejected = await recordSponsorCardReview(db, {
      actorId: 'user_admin',
      creativeId: creative,
      decision: 'rejected',
      reason: 'Wrong product',
      now: NOW,
      ...REVIEW,
    })
    expect(rejected.ok).toBe(true)
    const revised = parseSponsorCardFields(fields({ toolName: 'Widget Two' }))
    if (!revised.ok) throw new Error('card')
    const checkout = { sessionId: 'cs_resubmit', offering: 'placement_weekly' as const, taskSlug: 'coding' }
    const saved = await saveSponsorCardForSession(db, { card: revised.card, now: NOW + 1, checkout })
    expect(saved).toEqual({ ok: true })
    const pending = await db.select().from(sponsorshipCreatives)
    expect(pending[0]).toMatchObject({ status: 'pending', resubmissionCount: 1, version: 2 })
    const again = await recordSponsorCardReview(db, {
      actorId: 'user_admin',
      creativeId: creative,
      decision: 'rejected',
      reason: 'Still wrong',
      now: NOW + 2,
      version: pending[0]?.version ?? 0,
      updatedAt: pending[0]?.updatedAt ?? 0,
      contentHash: pending[0]?.contentHash ?? '',
    })
    expect(again.ok).toBe(true)
    const waiting = await db.select().from(sponsorshipCreatives)
    expect(waiting[0]?.refundStatus).toBe('refund_pending')
    const third = await saveSponsorCardForSession(db, { card: revised.card, now: NOW + 3, checkout })
    expect(third).toEqual({ ok: false, message: SPONSOR_RESUBMIT_CLOSED })
    const marked = await markSponsorRefunded(db, {
      actorId: 'user_admin',
      creativeId: creative,
      reason: '',
      now: NOW + 4,
    })
    expect(marked).toEqual({ ok: true })
    const repeat = await markSponsorRefunded(db, {
      actorId: 'user_admin',
      creativeId: creative,
      reason: '',
      now: NOW + 5,
    })
    expect(repeat.ok).toBe(false)
    const events = await db.select().from(sponsorshipRefundEvents)
    expect(events.map((event) => event.decision)).toEqual(['refund_pending', 'refunded'])
    expect(events[1]).toMatchObject({ actor: 'user_admin', reason: 'Refunded in the Stripe dashboard.' })
    const source = readFileSync(path.join(process.cwd(), 'src/lib/sponsor-card.ts'), 'utf8')
    expect(source).not.toContain('stripe.refunds')
    await close()
  })

  it('sets refund_pending when the 7-day window ends without a resubmission', async () => {
    const { db, close } = await createTestDatabase()
    const creative = await insertPending(db, 'cs_expire')
    await recordSponsorCardReview(db, {
      actorId: 'user_admin',
      creativeId: creative,
      decision: 'rejected',
      reason: 'Wrong product',
      now: NOW,
      ...REVIEW,
    })
    const checkout = { sessionId: 'cs_expire', offering: 'placement_weekly' as const, taskSlug: 'coding' }
    const inside = parseSponsorCardFields(fields())
    if (!inside.ok) throw new Error('card')
    await expireSponsorResubmissions(db, NOW + WEEK)
    const late = await saveSponsorCardForSession(db, { card: inside.card, now: NOW + WEEK, checkout })
    expect(late).toEqual({ ok: false, message: SPONSOR_RESUBMIT_CLOSED })
    const rows = await db.select().from(sponsorshipCreatives)
    expect(rows[0]?.refundStatus).toBe('refund_pending')
    const events = await db.select().from(sponsorshipRefundEvents)
    expect(events).toHaveLength(1)
    expect(events[0]?.reason).toBe('The 7-day resubmission window ended.')
    await close()
  })

  it('blocks edits after approval and keeps two checkout saves on one row', async () => {
    const { db, close } = await createTestDatabase()
    const creative = await insertPending(db, 'cs_locked')
    await recordSponsorCardReview(db, {
      actorId: 'user_admin',
      creativeId: creative,
      decision: 'approved',
      reason: '',
      now: NOW,
      ...REVIEW,
    })
    const parsed = parseSponsorCardFields(fields({ toolName: 'Other Name' }))
    if (!parsed.ok) throw new Error('card')
    const locked = await saveSponsorCardForSession(db, {
      card: parsed.card,
      now: NOW + 1,
      checkout: { sessionId: 'cs_locked', offering: 'placement_weekly', taskSlug: 'coding' },
    })
    expect(locked.ok).toBe(false)
    const approved = await db.select().from(sponsorshipCreatives)
    expect(approved[0]?.toolName).toBe('Widget')
    expect(approved[0]?.approvedToolName).toBe('Widget')

    const firstCard = parseSponsorCardFields(fields({ toolName: 'Alpha Tool' }))
    const secondCard = parseSponsorCardFields(fields({ toolName: 'Beta Tool' }))
    if (!firstCard.ok || !secondCard.ok) throw new Error('card')
    const [left, right] = await Promise.all([
      savePendingSponsorCard(db, { requestKey: 'same-request', card: firstCard.card, now: NOW + 2 }),
      savePendingSponsorCard(db, { requestKey: 'same-request', card: secondCard.card, now: NOW + 3 }),
    ])
    expect(left.ok && right.ok).toBe(true)
    const races = await db.select().from(sponsorshipCreatives)
    expect(races.filter((row) => row.requestKey === 'same-request')).toHaveLength(1)
    await close()
  })
})

function pngWithTextChunk(png: Buffer): Buffer {
  const marker = png.indexOf('IEND')
  const data = Buffer.from('Comment\0hi')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const chunk = Buffer.concat([length, Buffer.from('tEXt'), data, Buffer.alloc(4)])
  return Buffer.concat([png.subarray(0, marker - 4), chunk, png.subarray(marker - 4)])
}

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
    contentHash: HASH,
    version: 1,
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
      contentHash: HASH,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning({ id: sponsorshipCreatives.id })
  const id = rows[0]?.id
  if (!id) throw new Error('missing creative')
  return id
}

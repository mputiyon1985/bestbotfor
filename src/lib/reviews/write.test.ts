import { createHash } from 'node:crypto'
import { count, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestDatabase } from '@/test/db'
import { moderationEvents, reviewAggregates, reviewVersions, reviews, toolVendorDomains, tools } from '@/lib/db/schema'
import { aggregateFromReviews } from './aggregate'
import { pastReviewWait, vendorDomainDecision } from './eligibility'
import { submitReview, deleteReview, editReview, rebuildReviewAggregate, userLimitKey, type ReviewPrincipal, type ReviewWriteDeps, type ReviewWriteReason } from './write'

const now = Date.parse('2026-10-17T12:00:00Z')
const day = 24 * 60 * 60 * 1000
const secret = 'local-review-ip-hmac-secret-32b-yy'
const previousHooks = process.env.BBF_E2E_HOOKS

const form = {
  stars: 4,
  pros: 'Fast replies',
  cons: '',
  useCaseText: 'Writing',
  role: 'Developer',
  usageDuration: '1 to 6 months',
  planType: 'Paid plan',
  connection: 'none',
  connectionText: '',
  attestation: true,
}

function principal(overrides: Partial<ReviewPrincipal> = {}): ReviewPrincipal {
  return {
    userId: 'user_maria',
    emailVerified: true,
    verifiedEmails: ['maria@gmail.com'],
    createdAtMs: now - 80 * day,
    banned: false,
    staff: false,
    displayName: 'Maria L.',
    ...overrides,
  }
}

function headers(ip: string | null): ReviewWriteDeps['headers'] {
  return {
    get(name: string) {
      if (name.toLowerCase() === 'x-bbf-test-ip') return ip
      return null
    },
  }
}

function deps(
  db: ReviewWriteDeps['db'],
  overrides: Partial<ReviewWriteDeps> = {},
): ReviewWriteDeps {
  return {
    db,
    principal: principal(),
    headers: headers('203.0.113.7'),
    now,
    env: {
      userRatings: 'on',
      vercelEnv: 'test',
      reviewIpHmacSecret: secret,
      reviewIpHmacKeyId: 'k1',
      reviewUserLimitSecret: 'local-review-user-limit-secret-32b-zz',
    },
    ...overrides,
  }
}

afterEach(() => {
  if (previousHooks === undefined) delete process.env.BBF_E2E_HOOKS
  else process.env.BBF_E2E_HOOKS = previousHooks
})

async function seedTool(db: ReviewWriteDeps['db']) {
  const [tool] = await db
    .insert(tools)
    .values({
      slug: 'chatgpt',
      name: 'ChatGPT',
      vendor: 'OpenAI',
      url: 'https://chatgpt.com',
      category: 'Chat assistant',
      shortDesc: 'Chat',
      longDesc: 'Chat',
      pricingModel: 'freemium',
      priceFromUsd: 0,
      hasFreeTier: true,
      skillLevel: 'beginner',
      platforms: '[]',
      lastVerifiedAt: '2026-01-01',
      status: 'active',
    })
    .returning()
  if (!tool) throw new Error('tool missing')
  await db.insert(toolVendorDomains).values({ toolId: tool.id, domain: 'openai.com', source: 'manual', createdAt: 1 })
  return tool
}

async function reviewCount(db: ReviewWriteDeps['db']) {
  const [row] = await db.select({ n: count() }).from(reviews)
  return Number(row?.n ?? 0)
}

describe('eligibility helpers', () => {
  it('matches a corporate vendor domain and skips free mail', () => {
    expect(vendorDomainDecision(['staff@openai.com'], ['openai.com'])).toBe('match')
    expect(vendorDomainDecision(['maria@gmail.com'], ['openai.com'])).toBe('no_corporate_domain')
    expect(vendorDomainDecision(['pat@example.com'], ['openai.com'])).toBe('pass')
    expect(pastReviewWait(now - 72 * 60 * 60 * 1000, now)).toBe(true)
    expect(pastReviewWait(now - 72 * 60 * 60 * 1000 + 1, now)).toBe(false)
  })
})

describe('submitReview', () => {
  it('stores the raw name, one audit row, and hashes, and refuses every blocked case with no row', async () => {
    process.env.BBF_E2E_HOOKS = '1'
    const { db, close } = await createTestDatabase()
    try {
      await seedTool(db)
      const saved = await submitReview(deps(db, { principal: principal({ displayName: 'José L.' }) }), 'chatgpt', form)
      expect(saved.ok).toBe(true)
      if (!saved.ok) return
      expect(saved.displayName).toBe('José L.')
      expect(saved.created).toBe(true)
      const [row] = await db.select().from(reviews)
      expect(row?.displayName).toBe('José L.')
      expect(row?.status).toBe('pending')
      expect(row?.ipHmac).toMatch(/^[0-9a-f]{64}$/)
      expect(row?.netHmac).toMatch(/^[0-9a-f]{64}$/)
      expect(row?.ipKeyId).toBe('k1')
      expect(JSON.stringify(row)).not.toContain('203.0.113.7')
      expect(JSON.stringify(row)).not.toContain('gmail.com')
      const [events] = await db.select({ n: count() }).from(moderationEvents)
      expect(Number(events?.n ?? 0)).toBe(1)
      const [versions] = await db.select({ n: count() }).from(reviewVersions)
      expect(Number(versions?.n ?? 0)).toBe(1)

      const blocked: { reason: ReviewWriteReason; input: ReviewWriteDeps }[] = [
        { reason: 'flag_off', input: deps(db, { principal: principal({ userId: 'user_flag' }), env: { userRatings: 'off', vercelEnv: 'test', reviewIpHmacSecret: secret, reviewIpHmacKeyId: 'k1', reviewUserLimitSecret: 'local-review-user-limit-secret-32b-zz' } }) },
        { reason: 'signed_out', input: deps(db, { principal: null }) },
        { reason: 'unverified', input: deps(db, { principal: principal({ userId: 'user_unverified', emailVerified: false }) }) },
        { reason: 'waiting', input: deps(db, { principal: principal({ userId: 'user_waiting', createdAtMs: now - day }) }) },
        { reason: 'staff', input: deps(db, { principal: principal({ userId: 'user_staff', staff: true }) }) },
        { reason: 'banned', input: deps(db, { principal: principal({ userId: 'user_banned', banned: true }) }) },
        { reason: 'vendor_domain', input: deps(db, { principal: principal({ userId: 'user_vendor', verifiedEmails: ['staff@openai.com'], displayName: 'Pat Q.' }) }) },
        { reason: 'name_blocked', input: deps(db, { principal: principal({ userId: 'user_admin', displayName: 'Admin M.' }) }) },
        { reason: 'name_blocked', input: deps(db, { principal: principal({ userId: 'user_long', displayName: 'a'.repeat(61) }) }) },
        { reason: 'unavailable', input: deps(db, { principal: principal({ userId: 'user_noip' }), headers: headers(null) }) },
        { reason: 'unavailable', input: deps(db, { principal: principal({ userId: 'user_key' }), env: { userRatings: 'on', vercelEnv: 'test', reviewIpHmacSecret: 'short', reviewIpHmacKeyId: 'k1' } }) },
        { reason: 'unavailable', input: deps(db, { principal: principal({ userId: 'user_limit' }), limiter: async () => 'unavailable' }) },
        { reason: 'unavailable', input: deps(db, { principal: principal({ userId: 'user_timeout' }), limiter: () => new Promise(() => {}) }) },
        { reason: 'rate_limited', input: deps(db, { principal: principal({ userId: 'user_rate' }), limiter: async () => 'limit' }) },
        { reason: 'invalid', input: deps(db, { principal: principal({ userId: 'user_form' }) }) },
      ]
      for (const [index, item] of blocked.entries()) {
        const payload = item.reason === 'invalid' ? { ...form, clerkUserId: 'user_forged' } : form
        const result = await submitReview(item.input, 'chatgpt', payload)
        expect(result.ok, String(index)).toBe(false)
        if (!result.ok) expect(result.reason, String(index)).toBe(item.reason)
      }
      expect(await reviewCount(db)).toBe(1)
    } finally {
      await close()
    }
  })

  it('leaves one review row when the same user submits the same tool 20 times at once', async () => {
    process.env.BBF_E2E_HOOKS = '1'
    const { db, close } = await createTestDatabase()
    try {
      await seedTool(db)
      const results = await Promise.all(Array.from({ length: 20 }, () => submitReview(deps(db), 'chatgpt', form)))
      expect(results.some((result) => result.ok)).toBe(true)
      expect(await reviewCount(db)).toBe(1)
      const events = await db.select().from(moderationEvents)
      expect(events).toHaveLength(1)
    } finally {
      await close()
    }
  })

  it('keeps the published version on edit, withdraws on delete, and revalidates after delete', async () => {
    process.env.BBF_E2E_HOOKS = '1'
    const { db, close } = await createTestDatabase()
    try {
      await seedTool(db)
      const saved = await submitReview(deps(db), 'chatgpt', form)
      expect(saved.ok).toBe(true)
      const edited = await editReview(deps(db, { now: now + 1000 }), 'chatgpt', { ...form, stars: 5, pros: 'Still fast' })
      expect(edited.ok).toBe(true)
      const versions = await db.select().from(reviewVersions)
      expect(versions).toHaveLength(2)
      const [review] = await db.select().from(reviews)
      expect(review?.publishedVersionId).toBeNull()
      expect(review?.latestVersionId).toBe(versions[1]?.id)
      const calls: string[] = []
      const removed = await deleteReview({ ...deps(db, { now: now + 2000 }), revalidate: (value) => calls.push(value) }, 'chatgpt')
      expect(removed.ok).toBe(true)
      if (removed.ok) expect(removed.status).toBe('withdrawn')
      expect(calls).toEqual(['reviews:chatgpt', '/tools/chatgpt'])
      const events = await db.select().from(moderationEvents).where(eq(moderationEvents.action, 'delete'))
      expect(events).toHaveLength(1)
    } finally {
      await close()
    }
  })

  it('stores a disclosed connection as not counting, and a link only as a hint', async () => {
    process.env.BBF_E2E_HOOKS = '1'
    const { db, close } = await createTestDatabase()
    try {
      await seedTool(db)
      const disclosed = {
        ...form,
        connection: 'disclosed',
        connectionText: 'I work with the vendor',
        pros: 'See https://openai.com',
      }
      const saved = await submitReview(deps(db, { principal: principal({ userId: 'user_disclosed' }) }), 'chatgpt', disclosed)
      expect(saved.ok).toBe(true)
      const [row] = await db.select().from(reviews)
      expect(row?.countsTowardScore).toBe(0)
      expect(row?.status).toBe('pending')
      const [event] = await db.select().from(moderationEvents)
      expect(event?.note).toContain('vendor or competitor link')
      expect(event?.toStatus).toBe('pending')
    } finally {
      await close()
    }
  })

  it('rebuilds the same totals as a full pass over published counting reviews', async () => {
    const { db, close } = await createTestDatabase()
    try {
      const tool = await seedTool(db)
      await db.transaction(async (tx) => {
        const [review] = await tx
          .insert(reviews)
          .values({
            toolId: tool.id,
            clerkUserId: 'user_pub',
            status: 'published',
            latestVersionId: 0,
            weight: 1.5,
            countsTowardScore: 1,
            displayName: 'Ana K.',
            createdAt: now,
            updatedAt: now,
          })
          .returning()
        if (!review) throw new Error('review missing')
        const [version] = await tx
          .insert(reviewVersions)
          .values({
            reviewId: review.id,
            versionNo: 1,
            stars: 5,
            pros: '',
            cons: '',
            useCaseText: '',
            connection: 'none',
            connectionText: '',
            attestationVersion: '2026-10-v1',
            vendorDomainCheck: 'pass',
            decision: 'approved',
            contentHash: 'abc',
            createdAt: now,
          })
          .returning()
        if (!version) throw new Error('version missing')
        await tx
          .update(reviews)
          .set({ latestVersionId: version.id, publishedVersionId: version.id, publishedAt: now })
          .where(eq(reviews.id, review.id))
      })
      const totals = await rebuildReviewAggregate(db, tool.id, now)
      expect(totals).toEqual(aggregateFromReviews([{ stars: 5, weight: 1.5, countsTowardScore: 1 }]))
    } finally {
      await close()
    }
  })

  it('rebuilds the aggregate from published counting reviews', () => {
    const totals = aggregateFromReviews([
      { stars: 5, weight: 1, countsTowardScore: 1 },
      { stars: 5, weight: 1.5, countsTowardScore: 1 },
      { stars: 4, weight: 1, countsTowardScore: 1 },
      { stars: 2, weight: 1, countsTowardScore: 1 },
      { stars: 4, weight: 1.5, countsTowardScore: 1 },
      { stars: 1, weight: 1, countsTowardScore: 0 },
    ])
    expect(totals.publishedCount).toBe(5)
    expect(totals.weightTotal).toBe(6)
    expect(totals.weightedSum).toBe(24.5)
    expect(totals.star1).toBe(0)
    expect(totals.star5).toBe(2)
  })
})

describe('review write follow-ups (QA #47)', () => {
  it('reopens a withdrawn review as pending with a new version on resubmit', async () => {
    process.env.BBF_E2E_HOOKS = '1'
    const { db, close } = await createTestDatabase()
    try {
      await seedTool(db)
      expect((await submitReview(deps(db), 'chatgpt', form)).ok).toBe(true)
      expect((await deleteReview(deps(db, { now: now + 1000 }), 'chatgpt')).ok).toBe(true)
      const again = await submitReview(deps(db, { now: now + 2000 }), 'chatgpt', { ...form, stars: 2, pros: 'Changed my mind' })
      expect(again).toMatchObject({ ok: true, status: 'pending', created: false })
      const [review] = await db.select().from(reviews)
      expect(review?.status).toBe('pending')
      expect(review?.publishedVersionId).toBeNull()
      const versions = await db.select().from(reviewVersions)
      expect(versions).toHaveLength(2)
      expect(review?.latestVersionId).toBe(versions[1]?.id)
      expect(versions[1]?.stars).toBe(2)
      expect(await reviewCount(db)).toBe(1)
      const events = await db.select().from(moderationEvents).where(eq(moderationEvents.action, 'resubmit'))
      expect(events).toHaveLength(1)
      expect(events[0]?.fromStatus).toBe('withdrawn')
    } finally {
      await close()
    }
  })

  it('refuses a resubmit on a live review instead of returning ok and dropping it', async () => {
    process.env.BBF_E2E_HOOKS = '1'
    const { db, close } = await createTestDatabase()
    try {
      await seedTool(db)
      expect((await submitReview(deps(db), 'chatgpt', form)).ok).toBe(true)
      const again = await submitReview(deps(db, { now: now + 1000 }), 'chatgpt', { ...form, stars: 1 })
      expect(again).toEqual({ ok: false, reason: 'exists' })
      expect(await db.select().from(reviewVersions)).toHaveLength(1)
    } finally {
      await close()
    }
  })

  it('keeps rate limits on a resubmit after delete', async () => {
    process.env.BBF_E2E_HOOKS = '1'
    const { db, close } = await createTestDatabase()
    try {
      await seedTool(db)
      expect((await submitReview(deps(db), 'chatgpt', form)).ok).toBe(true)
      expect((await deleteReview(deps(db, { now: now + 1000 }), 'chatgpt')).ok).toBe(true)
      const limited = await submitReview(deps(db, { now: now + 2000, limiter: async () => 'limit' }), 'chatgpt', form)
      expect(limited).toMatchObject({ ok: false, reason: 'rate_limited' })
      const [review] = await db.select().from(reviews)
      expect(review?.status).toBe('withdrawn')
      expect(await db.select().from(reviewVersions)).toHaveLength(1)
    } finally {
      await close()
    }
  })

  it('reopens a withdrawn review as pending on edit', async () => {
    process.env.BBF_E2E_HOOKS = '1'
    const { db, close } = await createTestDatabase()
    try {
      await seedTool(db)
      expect((await submitReview(deps(db), 'chatgpt', form)).ok).toBe(true)
      expect((await deleteReview(deps(db, { now: now + 1000 }), 'chatgpt')).ok).toBe(true)
      const edited = await editReview(deps(db, { now: now + 2000 }), 'chatgpt', { ...form, stars: 3 })
      expect(edited).toMatchObject({ ok: true, status: 'pending' })
      const [review] = await db.select().from(reviews)
      expect(review?.status).toBe('pending')
      expect(review?.publishedVersionId).toBeNull()
      expect(await db.select().from(reviewVersions)).toHaveLength(2)
    } finally {
      await close()
    }
  })

  it('refuses delete when the ratings flag is off, and leaves the row', async () => {
    process.env.BBF_E2E_HOOKS = '1'
    const { db, close } = await createTestDatabase()
    try {
      await seedTool(db)
      expect((await submitReview(deps(db), 'chatgpt', form)).ok).toBe(true)
      const off = await deleteReview(deps(db, { env: { userRatings: 'off', vercelEnv: 'test' } }), 'chatgpt')
      expect(off).toEqual({ ok: false, reason: 'flag_off' })
      const prod = await deleteReview(deps(db, { env: { userRatings: 'on', vercelEnv: 'production' }, productionLaunch: false }), 'chatgpt')
      expect(prod).toEqual({ ok: false, reason: 'flag_off' })
      const [review] = await db.select().from(reviews)
      expect(review?.status).toBe('pending')
    } finally {
      await close()
    }
  })

  it('refuses delete for a banned user and when rate limited', async () => {
    process.env.BBF_E2E_HOOKS = '1'
    const { db, close } = await createTestDatabase()
    try {
      await seedTool(db)
      expect((await submitReview(deps(db), 'chatgpt', form)).ok).toBe(true)
      expect(await deleteReview(deps(db, { principal: principal({ banned: true }) }), 'chatgpt')).toEqual({ ok: false, reason: 'banned' })
      expect(await deleteReview(deps(db, { limiter: async () => 'limit' }), 'chatgpt')).toMatchObject({ ok: false, reason: 'rate_limited' })
      expect(await deleteReview(deps(db, { limiter: async () => 'unavailable' }), 'chatgpt')).toEqual({ ok: false, reason: 'unavailable' })
      const [review] = await db.select().from(reviews)
      expect(review?.status).toBe('pending')
    } finally {
      await close()
    }
  })

  it('fails closed through the default allowRate limiter when the rate-limit table fails', async () => {
    process.env.BBF_E2E_HOOKS = '1'
    const { db, close } = await createTestDatabase()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await seedTool(db)
      await db.$client.execute('DROP TABLE rate_limits')
      expect(await submitReview(deps(db), 'chatgpt', form)).toEqual({ ok: false, reason: 'unavailable' })
      expect(await editReview(deps(db), 'chatgpt', form)).toEqual({ ok: false, reason: 'unavailable' })
      expect(await deleteReview(deps(db), 'chatgpt')).toEqual({ ok: false, reason: 'unavailable' })
      expect(await reviewCount(db)).toBe(0)
    } finally {
      spy.mockRestore()
      await close()
    }
  })

  it('keys the per-user limit with an HMAC of the Clerk id, and fails closed without the secret', async () => {
    const keys: string[] = []
    process.env.BBF_E2E_HOOKS = '1'
    const previous = process.env.REVIEW_USER_LIMIT_SECRET
    delete process.env.REVIEW_USER_LIMIT_SECRET
    const { db, close } = await createTestDatabase()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await seedTool(db)
      const secretA = 'local-review-user-limit-secret-32b-zz'
      await submitReview(deps(db, { limiter: async (key) => { keys.push(key); return 'allow' } }), 'chatgpt', form)
      expect(keys[0]).toBe(userLimitKey('submit', 'user_maria', secretA))
      expect(keys[0]).toMatch(/^review:submit:user:[0-9a-f]{64}$/)
      expect(keys.join(' ')).not.toContain('user_maria')
      expect(keys[0]).not.toContain(createHash('sha256').update('review-user|user_maria').digest('hex'))
      expect(userLimitKey('submit', 'user_maria', 'another-review-user-limit-secret-32')).not.toBe(keys[0])
      expect(userLimitKey('submit', 'user_maria', 'short')).toBeNull()
      expect(userLimitKey('submit', 'user_maria', undefined)).toBeNull()
      const noSecret = deps(db)
      noSecret.env = { ...noSecret.env, reviewUserLimitSecret: undefined }
      let called = 0
      const limiter = async () => { called += 1; return 'allow' as const }
      expect(await submitReview({ ...noSecret, limiter }, 'chatgpt', form)).toEqual({ ok: false, reason: 'unavailable' })
      expect(await editReview({ ...noSecret, limiter }, 'chatgpt', form)).toEqual({ ok: false, reason: 'unavailable' })
      expect(await deleteReview({ ...noSecret, limiter }, 'chatgpt')).toEqual({ ok: false, reason: 'unavailable' })
      expect(called).toBe(0)
    } finally {
      spy.mockRestore()
      if (previous === undefined) delete process.env.REVIEW_USER_LIMIT_SECRET
      else process.env.REVIEW_USER_LIMIT_SECRET = previous
      await close()
    }
  })

  it('pins the delete limit at 20 per user per day', async () => {
    process.env.BBF_E2E_HOOKS = '1'
    const { db, close } = await createTestDatabase()
    try {
      await seedTool(db)
      const seen: [string, number, number][] = []
      await deleteReview(deps(db, { limiter: async (key, limit, windowMs) => { seen.push([key, limit, windowMs]); return 'allow' } }), 'chatgpt')
      expect(seen).toEqual([[userLimitKey('delete', 'user_maria', 'local-review-user-limit-secret-32b-zz'), 20, day]])
    } finally {
      await close()
    }
  })

  it('withdraws a published review, drops it from the aggregate, and reopens it without reviving the old version', async () => {
    process.env.BBF_E2E_HOOKS = '1'
    for (const reopen of ['submit', 'edit'] as const) {
      const { db, close } = await createTestDatabase()
      try {
        const tool = await seedTool(db)
        expect((await submitReview(deps(db), 'chatgpt', form)).ok).toBe(true)
        const [first] = await db.select().from(reviews)
        if (!first) throw new Error('review missing')
        await db.update(reviewVersions).set({ decision: 'approved', decidedAt: now }).where(eq(reviewVersions.id, first.latestVersionId))
        await db.update(reviews).set({ status: 'published', publishedVersionId: first.latestVersionId, publishedAt: now }).where(eq(reviews.id, first.id))
        await rebuildReviewAggregate(db, tool.id, now)
        const aggregate = async () => (await db.select().from(reviewAggregates))[0]?.publishedCount
        expect(await aggregate()).toBe(1)
        expect((await deleteReview(deps(db, { now: now + 1000 }), 'chatgpt')).ok).toBe(true)
        expect(await aggregate()).toBe(0)
        const [withdrawn] = await db.select().from(reviews)
        expect(withdrawn?.status).toBe('withdrawn')
        const result = reopen === 'submit'
          ? await submitReview(deps(db, { now: now + 2000 }), 'chatgpt', { ...form, stars: 2 })
          : await editReview(deps(db, { now: now + 2000 }), 'chatgpt', { ...form, stars: 2 })
        expect(result).toMatchObject({ ok: true, status: 'pending' })
        const [reopened] = await db.select().from(reviews)
        expect(reopened?.status).toBe('pending')
        expect(reopened?.publishedVersionId).toBeNull()
        expect(reopened?.latestVersionId).not.toBe(first.latestVersionId)
        expect(await aggregate()).toBe(0)
      } finally {
        await close()
      }
    }
  })
})

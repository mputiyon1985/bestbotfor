import { afterEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/test/db'
import { reviewVersions, reviews, tools } from '@/lib/db/schema'
import { runDataRetention } from '@/app/api/cron/data-retention/route'
import { deleteReview, submitReview, type ReviewWriteDeps } from './write'

const now = Date.parse('2026-10-17T12:00:00Z')
const day = 24 * 60 * 60 * 1000
const previousHooks = process.env.BBF_E2E_HOOKS
afterEach(() => {
  if (previousHooks === undefined) delete process.env.BBF_E2E_HOOKS
  else process.env.BBF_E2E_HOOKS = previousHooks
})

const form = {
  stars: 4,
  pros: 'Fast replies',
  cons: 'Pricey',
  useCaseText: 'Writing',
  role: 'Developer',
  usageDuration: '1 to 6 months',
  planType: 'Paid plan',
  connection: 'none',
  connectionText: '',
  attestation: true,
}

function deps(db: ReviewWriteDeps['db'], userId: string, at = now): ReviewWriteDeps {
  return {
    db,
    principal: {
      userId,
      emailVerified: true,
      verifiedEmails: [`${userId}@gmail.com`],
      createdAtMs: now - 80 * day,
      banned: false,
      staff: false,
      displayName: 'Maria L.',
    },
    headers: { get: (name: string) => (name.toLowerCase() === 'x-bbf-test-ip' ? '203.0.113.7' : null) },
    now: at,
    env: { userRatings: 'on', vercelEnv: 'test', reviewIpHmacSecret: 'local-review-ip-hmac-secret-32b-yy', reviewIpHmacKeyId: 'k1', reviewUserLimitSecret: 'local-review-user-limit-secret-32b-zz' },
  }
}

async function seed() {
  process.env.BBF_E2E_HOOKS = '1'
  const handle = await createTestDatabase()
  await handle.db.insert(tools).values({
    slug: 'chatgpt', name: 'ChatGPT', vendor: 'OpenAI', url: 'https://chatgpt.com', category: 'Chat assistant',
    shortDesc: 'Chat', longDesc: 'Chat', pricingModel: 'freemium', priceFromUsd: 0, hasFreeTier: true,
    skillLevel: 'beginner', platforms: '[]', lastVerifiedAt: '2026-01-01', status: 'active',
  })
  expect((await submitReview(deps(handle.db, 'user_a'), 'chatgpt', form)).ok).toBe(true)
  expect((await submitReview(deps(handle.db, 'user_b'), 'chatgpt', form)).ok).toBe(true)
  expect((await deleteReview(deps(handle.db, 'user_a', now + 1000), 'chatgpt')).ok).toBe(true)
  return handle
}

describe('withdrawn review purge (policy: text deleted within 24 hours)', () => {
  it('is a no-op while ratings are off and leaves the report shape unchanged', async () => {
    const { db, close } = await seed()
    try {
      const report = await runDataRetention(db, { dryRun: false, now: now + day, url: 'file:local.db', vercelEnv: 'test' })
      expect(report).not.toHaveProperty('reviewTextPurged')
      const versions = await db.select().from(reviewVersions)
      expect(versions.every((row) => row.pros === 'Fast replies')).toBe(true)
    } finally {
      await close()
    }
  })

  it('counts only in a dry run', async () => {
    const { db, close } = await seed()
    try {
      const report = await runDataRetention(db, { dryRun: true, now: now + day, ratingsEnabled: true })
      expect(report.reviewTextEligible).toBe(1)
      expect(report.reviewTextPurged).toBe(0)
      expect((await db.select().from(reviewVersions)).every((row) => row.pros === 'Fast replies')).toBe(true)
    } finally {
      await close()
    }
  })

  it('scrubs withdrawn text and IP hashes only, keeps live reviews, and is idempotent', async () => {
    const { db, close } = await seed()
    try {
      const report = await runDataRetention(db, { dryRun: false, now: now + day, ratingsEnabled: true, vercelEnv: 'test' })
      expect(report.reviewTextEligible).toBe(1)
      expect(report.reviewTextPurged).toBe(1)
      const rows = await db.select().from(reviews)
      const byUser = new Map(rows.map((row) => [row.clerkUserId, row]))
      const versions = await db.select().from(reviewVersions)
      const withdrawn = versions.filter((row) => row.reviewId === byUser.get('user_a')?.id)
      const live = versions.filter((row) => row.reviewId === byUser.get('user_b')?.id)
      expect(withdrawn).toHaveLength(1)
      expect(withdrawn[0]).toMatchObject({ pros: '', cons: '', useCaseText: '', connectionText: '', role: null, usageDuration: null, planType: null, attestationVersion: 'purged' })
      expect(byUser.get('user_a')?.latestVersionId).toBe(withdrawn[0]?.id)
      expect(byUser.get('user_a')?.publishedVersionId).toBeNull()
      expect(live).toHaveLength(1)
      expect(live[0]).toMatchObject({ pros: 'Fast replies', cons: 'Pricey', role: 'Developer' })
      expect(byUser.get('user_a')?.ipHmac).toBeNull()
      expect(byUser.get('user_b')?.ipHmac).not.toBeNull()
      const again = await runDataRetention(db, { dryRun: false, now: now + day, ratingsEnabled: true, vercelEnv: 'test' })
      expect(again.reviewTextEligible).toBe(0)
      expect(again.reviewTextPurged).toBe(0)
      // A purged review can still be resubmitted and reopens as pending.
      const reopened = await submitReview(deps(db, 'user_a', now + 2 * day), 'chatgpt', form)
      expect(reopened).toMatchObject({ ok: true, status: 'pending' })
    } finally {
      await close()
    }
  })
})

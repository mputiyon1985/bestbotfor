import { describe, expect, it } from 'vitest'
import { tasks, toolScores, toolTasks, tools } from './db/schema'
import { allMatchesRequest, cachedQuizStatus, resultOfflineStatus, resultRequestStatus } from './result-request'
import { createTestDatabase } from '@/test/db'

async function seed(db: Awaited<ReturnType<typeof createTestDatabase>>['db']) {
  await db.insert(tasks).values({ slug: 'chat', name: 'Chat and brainstorm', category: 'General', description: 'Talk.' })
  await db.insert(tools).values([
    toolRow(1, 'alpha', 'Alpha'),
    toolRow(2, 'archived', 'Archived Tool'),
    toolRow(3, 'unrated', 'Unrated Tool'),
  ])
  await db.insert(toolTasks).values([
    { toolId: 1, taskId: 1, fitScore: 80, notes: 'Alpha fits chat.' },
    { toolId: 2, taskId: 1, fitScore: 99, notes: 'Archived still fits on paper.' },
    { toolId: 3, taskId: 1, fitScore: 95, notes: 'Unrated: no editorial score, so never a quiz match.' },
  ])
  await db.insert(toolScores).values({
    toolId: 1,
    features: 4,
    value: 4,
    ease: 4,
    quality: 4,
    overall: 4,
    rationale: 'Rated.',
    sources: '[]',
    reviewedAt: '2026-10-16',
    quizEligible: true,
  })
  await db.insert(toolScores).values({
    toolId: 2,
    features: 1,
    value: 1,
    ease: 1,
    quality: 1,
    overall: 1,
    rationale: 'Archived.',
    sources: '[]',
    reviewedAt: '2026-10-16',
    quizEligible: false,
  })
}

function toolRow(id: number, slug: string, name: string) {
  return {
    id,
    slug,
    name,
    vendor: name,
    url: `https://${slug}.example`,
    category: 'Chat',
    shortDesc: `${name} short.`,
    longDesc: `${name} long description.`,
    pricingModel: 'freemium',
    priceFromUsd: 0,
    hasFreeTier: true,
    skillLevel: 'beginner',
    platforms: '["Web"]',
    lastVerifiedAt: '2026-10-16',
    status: 'active',
  }
}

describe('result request status', () => {
  it('404s an invalid quiz task or budget, and keeps a valid quiz and a missing skill on the page', async () => {
    const { db, close } = await createTestDatabase()
    await seed(db)

    expect(resultOfflineStatus(new URLSearchParams('task=Not_A_Task&budget=any&skill=beginner'))).toBe('not-found')
    expect(resultOfflineStatus(new URLSearchParams('task=chat&budget=mid&skill=beginner'))).toBe('not-found')
    expect(resultOfflineStatus(new URLSearchParams('budget=nope'))).toBe('not-found')
    expect(resultOfflineStatus(new URLSearchParams('task=chat&view=all&budget=mid'))).toBe('not-found')
    expect(resultOfflineStatus(new URLSearchParams(''))).toBe('ok')
    expect(resultOfflineStatus(new URLSearchParams('task=chat&budget=any'))).toBe('lookup')

    expect(await resultRequestStatus(db, new URLSearchParams('task=marketing&budget=any&skill=beginner'))).toBe('not-found')
    expect(await resultRequestStatus(db, new URLSearchParams('task=marketing'))).toBe('not-found')
    expect(await resultRequestStatus(db, new URLSearchParams('task=Not_A_Task&budget=any&skill=beginner'))).toBe('not-found')
    expect(await resultRequestStatus(db, new URLSearchParams('task=chat&budget=mid&skill=beginner'))).toBe('not-found')
    expect(await resultRequestStatus(db, new URLSearchParams('task=chat&budget=nope'))).toBe('not-found')
    expect(await resultRequestStatus(db, new URLSearchParams('task=chat&view=all&budget=mid'))).toBe('not-found')
    expect(await resultRequestStatus(db, new URLSearchParams('task=chat&view=other'))).toBe('not-found')
    expect(await resultRequestStatus(db, new URLSearchParams('task=chat&view=all&page=99'))).toBe('not-found')
    expect(await resultRequestStatus(db, new URLSearchParams('task=chat&budget=any&skill=beginner'))).toBe('ok')
    expect(await resultRequestStatus(db, new URLSearchParams('task=chat&budget=any'))).toBe('ok')
    expect(await resultRequestStatus(db, new URLSearchParams(''))).toBe('ok')

    const page = await allMatchesRequest(db, new URLSearchParams('task=chat&view=all'))
    expect(page?.tools.map((tool) => tool.slug)).toEqual(['alpha'])

    await close()
  })

  it('uses a cached task list for a quiz and only as a miss for all-matches', () => {
    const slugs = new Set(['chat'])
    expect(cachedQuizStatus(null, new URLSearchParams('task=chat&budget=any&skill=beginner'))).toBeNull()
    expect(cachedQuizStatus(slugs, new URLSearchParams('task=chat&budget=any&skill=beginner'))).toBe('ok')
    expect(cachedQuizStatus(slugs, new URLSearchParams('task=marketing&budget=any&skill=beginner'))).toBe('not-found')
    expect(cachedQuizStatus(slugs, new URLSearchParams('task=chat&view=all'))).toBeNull()
    expect(cachedQuizStatus(slugs, new URLSearchParams('task=marketing&view=all'))).toBe('not-found')
    expect(cachedQuizStatus(slugs, new URLSearchParams('task=Not_A_Task'))).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { tasks, toolScores, toolTasks, tools } from './db/schema'
import { latestIsoDate, readSitemapDates, SITEMAP_STATIC_LASTMOD } from './sitemap-dates'
import { createTestDatabase } from '@/test/db'

function toolRow(id: number, slug: string, lastVerifiedAt: string, status = 'active') {
  return {
    id,
    slug,
    name: slug,
    vendor: slug,
    url: `https://${slug}.example`,
    category: 'Chat',
    shortDesc: 's',
    longDesc: 'l',
    pricingModel: 'freemium',
    priceFromUsd: 0,
    hasFreeTier: true,
    skillLevel: 'beginner',
    platforms: '["Web"]',
    lastVerifiedAt,
    status,
  }
}

function scoreRow(toolId: number, reviewedAt: string) {
  return { toolId, features: 4, value: 4, ease: 4, quality: 4, overall: 4, rationale: 'r', sources: '[]', reviewedAt }
}

describe('sitemap lastmod dates', () => {
  it('picks the latest valid ISO date and ignores blanks and junk', () => {
    expect(latestIsoDate(['2026-10-15', '2026-10-16', null, undefined, ''])).toBe('2026-10-16')
    expect(latestIsoDate(['not-a-date', '2026/10/20'])).toBeNull()
    expect(latestIsoDate([])).toBeNull()
  })

  it('uses a fixed static date, not the build time', () => {
    expect(SITEMAP_STATIC_LASTMOD).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('dates tools by the later of verified and reviewed, and tasks by their newest active tool', async () => {
    const { db, close } = await createTestDatabase()
    try {
      await db.insert(tasks).values([
        { slug: 'chat', name: 'Chat', category: 'General', description: 'd' },
        { slug: 'coding', name: 'Code', category: 'Build', description: 'd' },
        { slug: 'empty', name: 'Empty', category: 'Build', description: 'd' },
      ])
      await db.insert(tools).values([
        toolRow(1, 'alpha', '2026-10-15'),
        toolRow(2, 'beta', '2026-10-12'),
        toolRow(3, 'gone', '2026-10-30', 'retired'),
      ])
      await db.insert(toolScores).values([scoreRow(1, '2026-10-17'), scoreRow(2, '2026-10-10')])
      await db.insert(toolTasks).values([
        { toolId: 1, taskId: 1, fitScore: 90, notes: 'n' },
        { toolId: 2, taskId: 2, fitScore: 80, notes: 'n' },
        { toolId: 3, taskId: 2, fitScore: 99, notes: 'n' },
      ])
      const dates = await readSitemapDates(db)
      expect(dates.tools.get('alpha')).toBe('2026-10-17')
      expect(dates.tools.get('beta')).toBe('2026-10-12')
      expect(dates.tools.has('gone')).toBe(false)
      expect(dates.tasks.get('chat')).toBe('2026-10-17')
      expect(dates.tasks.get('coding')).toBe('2026-10-12')
      expect(dates.tasks.has('empty')).toBe(false)
      expect(dates.catalog).toBe('2026-10-17')
    } finally {
      await close()
    }
  })
})

import { readFileSync } from 'node:fs'
import { count } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { readToolCategoryCounts, readToolPage, readVisibleToolCount } from './catalog-read'
import { tools } from './db/schema'
import { formatVisibleToolCount, VISIBLE_TOOL_COUNT_WORD, visibleToolCountLabel } from './visible-tool-count'
import { VISIBLE_TOOL_STATUS, visibleToolStatus } from './visible-tool-status'
import { createTestDatabase } from '@/test/db'

function toolRow(id: number, slug: string, status: string) {
  return {
    id,
    slug,
    name: slug,
    vendor: slug,
    url: `https://${slug}.example`,
    category: 'Chat',
    shortDesc: `${slug} short.`,
    longDesc: `${slug} long description.`,
    pricingModel: 'freemium',
    priceFromUsd: 20,
    hasFreeTier: true,
    skillLevel: 'beginner',
    platforms: '["Web"]',
    lastVerifiedAt: '2026-10-15',
    status,
  }
}

function expectedCount(count: number): string {
  const formatted = new Intl.NumberFormat('en-US').format(count)
  const noun = count === 1 ? 'tool' : 'tools'
  return `${formatted} AI ${noun} ${VISIBLE_TOOL_COUNT_WORD}`
}

describe('formatVisibleToolCount', () => {
  it('groups thousands and stays a short line', () => {
    expect(formatVisibleToolCount(260)).toBe(expectedCount(260))
    expect(formatVisibleToolCount(1260)).toBe(expectedCount(1260))
    expect(formatVisibleToolCount(1)).toBe(expectedCount(1))
    expect(formatVisibleToolCount(0)).toBe(expectedCount(0))
  })

  it('rejects a count that is not a whole number', () => {
    expect(formatVisibleToolCount(-1)).toBeNull()
    expect(formatVisibleToolCount(1.5)).toBeNull()
    expect(formatVisibleToolCount(Number.NaN)).toBeNull()
    expect(formatVisibleToolCount(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('visibleToolCountLabel', () => {
  it('hides the line when the read fails and shows it when the read works', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(visibleToolCountLabel(async () => {
      throw new Error('db down')
    })).resolves.toBeNull()
    await expect(visibleToolCountLabel(async () => 1260)).resolves.toBe(expectedCount(1260))
  })
})

describe('readVisibleToolCount', () => {
  it('uses the public directory filter, so an unlisted tool is not counted', async () => {
    const { db, close } = await createTestDatabase()
    try {
      await db.insert(tools).values([
        toolRow(1, 'alpha', VISIBLE_TOOL_STATUS),
        toolRow(2, 'beta', VISIBLE_TOOL_STATUS),
        toolRow(3, 'hidden-one', 'hidden'),
        toolRow(4, 'draft-one', 'draft'),
        toolRow(5, 'unlisted-one', 'unlisted'),
      ])
      const total = await readVisibleToolCount(db)
      const page = await readToolPage(db, 1)
      const categories = await readToolCategoryCounts(db)
      expect(total).toBe(2)
      expect(page.total).toBe(total)
      expect(page.tools.map((tool) => tool.slug).sort()).toEqual(['alpha', 'beta'])
      expect(categories.reduce((sum, row) => sum + row.total, 0)).toBe(total)
      expect(db.select({ total: count() }).from(tools).where(visibleToolStatus()).toSQL().params).toEqual([VISIBLE_TOOL_STATUS])
    } finally {
      await close()
    }
  })
})

describe('homepage hero', () => {
  it('places the count on the eyebrow line so it does not add a block under the heading', () => {
    const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
    const eyebrow = page.indexOf('Answer 3 quick questions')
    const count = page.indexOf('{toolCountLabel}')
    const heading = page.indexOf('<h1')
    const lede = page.indexOf('Answer three quick questions')
    expect(page).toContain('visibleToolCountLabel()')
    expect(eyebrow).toBeGreaterThan(-1)
    expect(count).toBeGreaterThan(eyebrow)
    expect(heading).toBeGreaterThan(count)
    expect(lede).toBeGreaterThan(heading)
    const space = page.indexOf("{' '}")
    expect(space).toBeGreaterThan(eyebrow)
    expect(count).toBeGreaterThan(space)
    expect(page).toContain('<br className="md:hidden" />')
    expect(page).toContain('tabular-nums')
    expect(page).not.toMatch(/<h1[\s\S]*toolCountLabel/)
  })
})

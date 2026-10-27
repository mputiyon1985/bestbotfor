import { readFileSync } from 'node:fs'
import { count } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { readToolCategoryCounts, readToolPage, readVisibleToolCount } from './catalog-read'
import { tools } from './db/schema'
import { formatVisibleToolCount, visibleToolCountLabel } from './visible-tool-count'
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

describe('formatVisibleToolCount', () => {
  it('groups thousands and stays a short line', () => {
    expect(formatVisibleToolCount(260)).toBe('260 AI tools rated')
    expect(formatVisibleToolCount(1260)).toBe('1,260 AI tools rated')
    expect(formatVisibleToolCount(1)).toBe('1 AI tool rated')
    expect(formatVisibleToolCount(0)).toBe('0 AI tools rated')
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
    await expect(visibleToolCountLabel(async () => 1260)).resolves.toBe('1,260 AI tools rated')
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
  it('places the count under the heading as text', () => {
    const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
    const heading = page.indexOf('<h1')
    const count = page.indexOf('{toolCountLabel}')
    const lede = page.indexOf('Answer three quick questions')
    expect(page).toContain('visibleToolCountLabel()')
    expect(heading).toBeGreaterThan(-1)
    expect(count).toBeGreaterThan(heading)
    expect(lede).toBeGreaterThan(count)
    expect(page).toContain('tabular-nums')
  })
})

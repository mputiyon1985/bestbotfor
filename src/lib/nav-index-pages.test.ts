import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { comparePairSeeds } from '@/data/catalog'
import { compareIndexEntries } from './compare-index'

const read = (p: string) => readFileSync(p, 'utf8')

describe('header nav index pages', () => {
  it('Best for -> /best, Compare -> /compare, no Pricing in the nav (desktop and mobile share the list)', () => {
    const header = read('src/components/site-header.tsx')
    expect(header).toContain("{ href: '/best', label: 'Best for' }")
    expect(header).toContain("{ href: '/compare', label: 'Compare' }")
    expect(header).not.toContain("label: 'Pricing'")
    expect(header.match(/links\.map/g)).toHaveLength(2)
  })

  it('/compare lists every seeded pair from code', () => {
    const entries = compareIndexEntries()
    expect(entries).toHaveLength(comparePairSeeds.length)
    expect(entries[0]?.path).toMatch(/^\/compare\/[a-z0-9-]+-vs-[a-z0-9-]+$/)
    expect(entries.every((e) => / vs /.test(e.title))).toBe(true)
  })

  it('/best links every category with a pick and its guide; both index pages carry ItemList, no ratings, and are in the sitemap', () => {
    const best = read('src/app/best/page.tsx')
    expect(best).toContain('const listed = rows.filter((row) => row.pick)')
    expect(best).toContain('guidePath(row.taskSlug)')
    const compare = read('src/app/compare/page.tsx')
    for (const src of [best, compare]) {
      expect(src).toContain("'@type': 'ItemList'")
      expect(src).not.toMatch(/aggregateRating|ratingValue|reviewRating|'Review'/)
    }
    expect(compare).not.toMatch(/getDb|from '@\/lib\/catalog'/)
    const sitemap = read('src/app/sitemap.ts')
    expect(sitemap).toContain("'/best',")
    expect(sitemap).toContain("'/compare',")
    expect(read('src/app/pricing/page.tsx')).toBeTruthy()
  })
})

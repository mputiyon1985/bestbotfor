import { describe, expect, it } from 'vitest'
import { taskSeeds } from '@/data/catalog'
import { CATEGORY_GUIDES } from '@/content/category-guides'
import { SEO_META } from './seo-meta'

describe('SEO meta overrides', () => {
  it('keeps titles at 60 characters and descriptions at 160', () => {
    for (const [path, meta] of Object.entries(SEO_META)) {
      expect(meta.title.length, path).toBeLessThanOrEqual(60)
      expect(meta.description.length, path).toBeLessThanOrEqual(160)
    }
  })

  it('only targets pages that exist', () => {
    for (const path of Object.keys(SEO_META)) {
      const [, kind, slug] = path.split('/')
      if (kind === 'best') expect(taskSeeds.some((task) => task.slug === slug), path).toBe(true)
      else expect(CATEGORY_GUIDES.some((guide) => guide.category === slug), path).toBe(true)
    }
  })

})

import { describe, expect, it } from 'vitest'
import { NOVA_COPY_PUBLISHED, novaCopy, novaDraftSlugs } from './nova-comparisons'

describe('Nova comparison copy', () => {
  it('publishes all 10 approved drafts, with none held', () => {
    expect([...NOVA_COPY_PUBLISHED].sort()).toEqual([...novaDraftSlugs()].sort())
    expect(novaDraftSlugs()).toHaveLength(10)
    const held = novaDraftSlugs().filter((slug) => novaCopy(slug) === null).sort()
    expect(held).toEqual([])
    for (const slug of novaDraftSlugs()) {
      const copy = novaCopy(slug)
      if (copy) expect(copy, slug).not.toMatch(/^# /m)
    }
  })

  it('publishes jasper-alternatives with a Writesonic row that matches the catalog (paid, free trial, no card)', () => {
    const copy = novaCopy('jasper-alternatives')
    expect(copy).not.toBeNull()
    expect(copy).toContain('| Writesonic | Starter $79/mo yearly;')
    expect(copy).not.toMatch(/\| Writesonic \|[^\n]*\| Yes/)
  })

  it('lists Semrush SEO at $139/mo on surfer-alternatives, matching the catalog', () => {
    const copy = novaCopy('surfer-alternatives') ?? ''
    expect(copy).toContain('SEO plan $139/mo')
    expect(copy).not.toContain('$139.95')
  })

  it('renders nothing for unpublished or unknown slugs', () => {
    expect(novaCopy('chatgpt-vs-claude', new Set())).toBeNull()
    expect(novaCopy('nope', new Set(['nope']))).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { NOVA_COPY_PUBLISHED, novaCopy, novaDraftSlugs } from './nova-comparisons'

describe('Nova comparison copy', () => {
  it('publishes all 10 approved drafts, holding any with an open [VERIFY] marker', () => {
    expect([...NOVA_COPY_PUBLISHED].sort()).toEqual(novaDraftSlugs().filter((slug) => slug !== 'jasper-alternatives').sort())
    expect(novaDraftSlugs()).toHaveLength(10)
    const held = novaDraftSlugs().filter((slug) => novaCopy(slug) === null).sort()
    expect(held).toEqual(['jasper-alternatives'])
    for (const slug of novaDraftSlugs()) {
      const copy = novaCopy(slug)
      if (copy) expect(copy, slug).not.toMatch(/^# /m)
    }
  })

  it('renders nothing for unpublished or unknown slugs', () => {
    expect(novaCopy('chatgpt-vs-claude', new Set())).toBeNull()
    expect(novaCopy('nope', new Set(['nope']))).toBeNull()
  })
})

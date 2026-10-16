import { describe, expect, it } from 'vitest'
import type { Catalog, CatalogTool } from './catalog-types'
import { canonicalOgPath, ogCopy } from './og'

function tool(slug: string, name: string): CatalogTool {
  return {
    id: 1,
    slug,
    name,
    vendor: name,
    url: `https://${slug}.example`,
    category: 'Chat',
    shortDesc: `${name} short description.`,
    longDesc: `${name} long description.`,
    pricingModel: 'freemium',
    priceFromUsd: null,
    hasFreeTier: true,
    skillLevel: 'beginner',
    platforms: ['Web'],
    lastVerifiedAt: '2026-10-15',
    fits: [
      { taskSlug: 'chat', taskName: 'Chat and brainstorm', score: slug === 'chatgpt' ? 90 : 70, notes: 'Notes' },
      { taskSlug: 'writing', taskName: 'Write marketing copy', score: slug === 'claude' ? 88 : 60, notes: 'Notes' },
    ],
    affiliate: {
      hasProgram: false,
      network: null,
      sourceUrl: null,
      status: 'none',
      commissionNote: null,
      affiliateUrl: null,
    },
    editorial: null,
    pros: [],
    cons: [],
  }
}

const catalog: Catalog = {
  tasks: [{ slug: 'chat', name: 'Chat and brainstorm', category: 'General', description: 'Talk through ideas.' }],
  tools: [tool('chatgpt', 'ChatGPT'), tool('claude', 'Claude')],
}

describe('ogCopy', () => {
  it('uses both tools for a compare pair', () => {
    const copy = ogCopy({ kind: 'compare', pair: 'chatgpt-vs-claude' }, catalog)
    expect(copy.title).toBe('ChatGPT vs Claude')
    expect(copy.subtitle).toContain('ChatGPT')
    expect(copy.subtitle).toContain('Claude')
  })

  it('describes a result without doubling the word budget', () => {
    const copy = ogCopy({ kind: 'result', task: 'chat', budget: 'any', skill: 'beginner' }, catalog)
    expect(copy.title).toBe('Best AI tool for chat and brainstorm')
    expect(copy.subtitle).toContain('on any budget')
    expect(copy.subtitle).not.toContain('budget budget')
    expect(copy.subtitle).not.toContain('a any')
  })

  it('does not echo an unknown pair', () => {
    const copy = ogCopy({ kind: 'compare', pair: 'not-a-tool-vs-also-missing' }, catalog)
    expect(copy.title).toBe('Comparison')
    expect(copy.subtitle).not.toContain('not-a-tool')
  })
})

describe('canonicalOgPath', () => {
  it('keeps a real compare, result, and task on one url each', () => {
    expect(canonicalOgPath(new URLSearchParams('kind=compare&pair=chatgpt-vs-claude'), catalog)).toBe(
      '/api/og?kind=compare&pair=chatgpt-vs-claude',
    )
    expect(canonicalOgPath(new URLSearchParams('kind=result&task=chat&budget=any&skill=beginner'), catalog)).toBe(
      '/api/og?kind=result&task=chat&budget=any&skill=beginner',
    )
    expect(canonicalOgPath(new URLSearchParams('kind=task&task=chat'), catalog)).toBe('/api/og?kind=task&task=chat')
  })

  it('sends invalid, reordered, and free-text params to the default card', () => {
    expect(canonicalOgPath(new URLSearchParams('title=<script>&subtitle=x'), catalog)).toBe('/api/og')
    expect(canonicalOgPath(new URLSearchParams('kind=compare&pair=not-a-tool-vs-also-missing'), catalog)).toBe('/api/og')
    expect(canonicalOgPath(new URLSearchParams('pair=chatgpt-vs-claude&kind=compare'), catalog)).toBe(
      '/api/og?kind=compare&pair=chatgpt-vs-claude',
    )
    expect(canonicalOgPath(new URLSearchParams('kind=result&skill=beginner&budget=any&task=chat&extra=1'), catalog)).toBe(
      '/api/og?kind=result&task=chat&budget=any&skill=beginner',
    )
    expect(canonicalOgPath(new URLSearchParams('kind=task&task=missing'), catalog)).toBe('/api/og')
  })

  it('does not treat a missing catalog as an invalid url', () => {
    expect(canonicalOgPath(new URLSearchParams('kind=compare&pair=chatgpt-vs-claude'), null)).toBeNull()
    expect(canonicalOgPath(new URLSearchParams('kind=result&task=chat&budget=any&skill=beginner'), null)).toBeNull()
    expect(canonicalOgPath(new URLSearchParams('kind=task&task=chat'), null)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { ANNUAL_BILLED_SLUGS, isAnnualBilledSlug } from './annual-billed'
import { priceLabel } from './format'
import { TOOL_DESCRIPTION_MAX, toolMetaDescription } from './tool-meta'

const ANNUAL_PRICE: Record<(typeof ANNUAL_BILLED_SLUGS)[number], string> = {
  perplexity: 'Free tier, then $17/mo and up, billed annually',
  'lalal-ai': 'Free tier, then $7.50/mo and up, billed annually',
  agentspot: 'Free tier, then $1,650/mo and up, billed annually',
}

function metaLead(tool: { name: string; vendor: string; shortDesc: string }): string {
  return `${tool.name} by ${tool.vendor}: ${tool.shortDesc.trim().replace(/\.?$/, '.')}`
}

/** A cut ends at a space in the lead, so the ellipsis does not split a word. */
function expectWordBoundary(description: string, lead: string, slug: string) {
  const at = description.indexOf('…')
  if (at === -1) return
  const before = description.slice(0, at)
  expect(lead.startsWith(before), `${slug} ${description}`).toBe(true)
  const next = lead[before.length]
  expect(next === undefined || /\s/.test(next), `${slug} cut mid-word: ${description}`).toBe(true)
}

const seed = (slug: string) => {
  const tool = toolSeeds.find((item) => item.slug === slug)
  if (!tool) throw new Error(`missing ${slug}`)
  return tool
}

describe('annual-billed price labels', () => {
  it('marks every annual-list tool on the card label and the search snippet', () => {
    expect([...ANNUAL_BILLED_SLUGS]).toEqual(['perplexity', 'lalal-ai', 'agentspot'])
    for (const slug of ANNUAL_BILLED_SLUGS) {
      const tool = seed(slug)
      expect(priceLabel(tool), slug).toBe(ANNUAL_PRICE[slug])
      expect(priceLabel(tool), slug).toContain('/mo')
      expect(tool.longDesc, slug).toMatch(/billed annually/i)
      const snippet = toolMetaDescription(tool)
      expect(snippet, slug).toContain(ANNUAL_PRICE[slug])
      expect(snippet, slug).toContain('billed annually')
      expect(snippet.length, slug).toBeLessThanOrEqual(TOOL_DESCRIPTION_MAX)
      expectWordBoundary(snippet, metaLead(tool), slug)
    }
  })

  it('cuts the AgentSpot snippet on a word and keeps the monthly annual price', () => {
    expect(toolMetaDescription(seed('agentspot'))).toBe(
      'AgentSpot by ThoughtSpot: A shared workspace where teams build agents, workflows and apps on business… Price: Free tier, then $1,650/mo and up, billed annually.',
    )
  })

  it('takes the suffix from the annual list, not a one-off AgentSpot string', () => {
    const agentspot = seed('agentspot')
    expect(priceLabel(agentspot)).toBe('Free tier, then $1,650/mo and up, billed annually')
    expect(priceLabel({ ...agentspot, slug: 'not-on-the-list' })).toBe('Free tier, then $1,650 and up')
    expect(isAnnualBilledSlug('agentspot')).toBe(true)
    expect(isAnnualBilledSlug('krisp')).toBe(false)
    expect(priceLabel(seed('krisp'))).not.toContain('billed annually')
    expect(priceLabel(seed('krisp'))).not.toContain('/mo')
  })

  it('keeps AgentSpot freemium because the pricing page lists a free plan', () => {
    expect(seed('agentspot')).toMatchObject({ pricingModel: 'freemium', hasFreeTier: true, priceFromUsd: 1650 })
  })

  it('leaves Pika and Resemble AI without a free tier', () => {
    // pika.art/faq: Free plan, no monthly credit allowance (packs only).
    // resemble.ai/pricing: Flex is $0/mo pay-as-you-go with no included usage.
    expect(seed('pika')).toMatchObject({ pricingModel: 'freemium', hasFreeTier: false })
    expect(seed('resemble-ai')).toMatchObject({ pricingModel: 'freemium', hasFreeTier: false })
  })
})

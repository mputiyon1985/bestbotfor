import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { ANNUAL_BILLED_SLUGS, isAnnualBilledSlug } from './annual-billed'
import { priceLabel } from './format'
import { TOOL_DESCRIPTION_MAX, toolMetaDescription } from './tool-meta'

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
      expect(priceLabel(tool), slug).toContain('billed annually')
      expect(tool.longDesc, slug).toMatch(/billed annually/i)
      const snippet = toolMetaDescription(tool)
      expect(snippet, slug).toContain('billed annually')
      expect(snippet.length, slug).toBeLessThanOrEqual(TOOL_DESCRIPTION_MAX)
    }
  })

  it('takes the suffix from the annual list, not a one-off AgentSpot string', () => {
    const agentspot = seed('agentspot')
    expect(priceLabel(agentspot)).toBe('Free tier, then $1,650 and up, billed annually')
    expect(priceLabel({ ...agentspot, slug: 'not-on-the-list' })).toBe('Free tier, then $1,650 and up')
    expect(isAnnualBilledSlug('agentspot')).toBe(true)
    expect(isAnnualBilledSlug('krisp')).toBe(false)
    expect(priceLabel(seed('krisp'))).not.toContain('billed annually')
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

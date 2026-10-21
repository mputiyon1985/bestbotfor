import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { priceLabel } from './format'
import nextConfig from '../../next.config'

const seed = (slug: string) => toolSeeds.find((tool) => tool.slug === slug)!

describe('Oct 20 catalog fixes (seed is what prod re-seeds from)', () => {
  it('merges the one-tool "Coding" category into "Coding assistant"', () => {
    expect(seed('cursor').category).toBe('Coding assistant')
    expect(toolSeeds.some((tool) => tool.category === 'Coding')).toBe(false)
  })

  it('301s /tools?category=coding to coding-assistant', async () => {
    const redirects = await nextConfig.redirects!()
    expect(redirects).toContainEqual(
      expect.objectContaining({
        source: '/tools',
        has: [{ type: 'query', key: 'category', value: 'coding' }],
        destination: '/tools?category=coding-assistant',
        statusCode: 301,
      }),
    )
  })

  it('Lindy: no free tier (7-day $50 credit trial), paid from $49.99', () => {
    const lindy = seed('lindy')
    expect([lindy.pricingModel, lindy.priceFromUsd, lindy.hasFreeTier]).toEqual(['paid', 49.99, false])
    expect(priceLabel(lindy)).toBe('$49.99 and up')
  })

  it('pros/cons wording matches the vendor pages', () => {
    for (const file of ['src/data/scores-v2.3.csv', 'src/data/scores-pros-cons.csv']) {
      const csv = readFileSync(file, 'utf8')
      expect(csv).toContain('Paid plans from $49.99 per user a month for 5,000 credits')
      expect(csv).toContain('Free trial: $50 in credits for 7 days, no card needed')
      expect(csv).toContain('Premium plan at $25 a month billed yearly adds the Webflow CMS')
      expect(csv).toContain('Pro is $16.99 a month, or $8.33 a month billed annually')
      expect(csv).not.toMatch(/Team plan from \$49\.99|CMS plan at \$25|\$8\.49 a month billed yearly/)
    }
  })

  it('Claude Code, Midjourney, Jasper and Surfer have no free tier', () => {
    for (const slug of ['claude-code', 'midjourney', 'jasper', 'surfer']) {
      expect(seed(slug).hasFreeTier, slug).toBe(false)
      expect(priceLabel(seed(slug)), slug).not.toMatch(/Free/)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { priceLabel } from './format'

const seed = (slug: string) => toolSeeds.find((tool) => tool.slug === slug)!

// Ratings backlog batch 02: priceFromUsd is the monthly-billed price (LALAL.AI publishes only an annual plan).
describe('batch 02 catalog fixes (seed is what prod re-seeds from)', () => {
  it('prices Kimi, Async and Kagi at their monthly-billed plans', () => {
    expect(seed('kimi').priceFromUsd).toBe(19)
    expect(seed('podcastle').priceFromUsd).toBe(19.99)
    expect(seed('kagi').priceFromUsd).toBe(5)
    expect(priceLabel(seed('kagi'))).toBe('$5 and up')
  })

  it('prices LALAL.AI at the annual-billed Lite rate and says so', () => {
    const lalal = seed('lalal-ai')
    expect(lalal.priceFromUsd).toBe(7.5)
    expect(lalal.longDesc).toContain('$7.50 a month, billed annually')
    expect(priceLabel(lalal)).toBe('Free tier, then $7.50/mo and up, billed annually')
  })

  it('keeps Deepgram usage-based with no monthly price', () => {
    expect(seed('deepgram').priceFromUsd).toBeNull()
  })

  it('moves Kimi from Research to Chat assistant', () => {
    expect(seed('kimi').category).toBe('Chat assistant')
  })

  it('unlists You.com and Resemble AI but keeps their records', () => {
    for (const slug of ['you-com', 'resemble-ai']) {
      expect(seed(slug), slug).toBeTruthy()
      expect(seed(slug).unlisted, slug).toBe(true)
    }
  })
})

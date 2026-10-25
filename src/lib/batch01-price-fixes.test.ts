import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { priceLabel } from './format'

const seed = (slug: string) => toolSeeds.find((tool) => tool.slug === slug)!

// Ratings backlog batch 01 (#156): priceFromUsd is the monthly-billed price.
describe('batch 01 price fixes (seed is what prod re-seeds from)', () => {
  it('prices Warp at the $20 monthly-billed Build plan', () => {
    expect(seed('warp').priceFromUsd).toBe(20)
    expect(priceLabel(seed('warp'))).toBe('Free tier, then $20 and up')
  })

  it('prices JetBrains AI at the $10 monthly-billed AI Pro plan, not the annual $8.33', () => {
    const jetbrains = seed('jetbrains-ai')
    expect(jetbrains.priceFromUsd).toBe(10)
    expect(priceLabel(jetbrains)).toBe('Free tier, then $10 and up')
    expect(jetbrains.longDesc).toContain('AI Pro is $10 a month billed monthly, or $100 a year.')
    expect(jetbrains.longDesc).not.toContain('8.33')
    expect(jetbrains.longDesc).not.toMatch(/yearly only/i)
  })
})

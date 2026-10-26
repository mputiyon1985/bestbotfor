import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'

const seed = (slug: string) => {
  const tool = toolSeeds.find((item) => item.slug === slug)
  if (!tool) throw new Error(`missing ${slug}`)
  return tool
}

const FRESH = '2026-10-26'

// Forge weekly freshness 2026-10-26. priceFromUsd is the monthly-billed price unless longDesc says billed annually.
describe('catalog freshness 2026-10-26', () => {
  it('moves TextCortex and Hedra to paid plans and drops the stale free-plan sentence', () => {
    const textcortex = seed('textcortex')
    expect(textcortex).toMatchObject({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 29.99, lastVerifiedAt: FRESH })
    expect(textcortex.longDesc).toContain('Premium is $29.99 per user a month billed monthly')
    expect(textcortex.longDesc).not.toContain('Free plan is limited')
    for (const file of ['src/data/scores-v2.3.csv', 'src/data/scores-pros-cons.csv']) {
      const line = readFileSync(join(process.cwd(), file), 'utf8').split(/\r?\n/).find((row) => row.startsWith('textcortex,'))
      expect(line, file).toContain('there is no free plan')
      expect(line, file).not.toContain('Free plan, no credit card')
      const hedraLine = readFileSync(join(process.cwd(), file), 'utf8').split(/\r?\n/).find((row) => row.startsWith('hedra,'))
      expect(hedraLine, file).toContain('No free plan; Studio Basic is $20 a month')
      expect(hedraLine, file).not.toContain('Free plan, no credit card')
    }

    const hedra = seed('hedra')
    expect(hedra).toMatchObject({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 20, lastVerifiedAt: FRESH })
    expect(hedra.longDesc).toContain('Studio plans start at $20 a month')
    expect(hedra.longDesc).not.toContain('Free plan is limited')
  })

  it('keeps Semrush at $139 after the #143 revert to $139.95', () => {
    const semrush = seed('semrush')
    expect(semrush).toMatchObject({ pricingModel: 'freemium', hasFreeTier: true, priceFromUsd: 139, lastVerifiedAt: FRESH })
    expect(semrush.longDesc).toContain('$139/mo billed monthly')
    expect(semrush.longDesc).not.toContain('139.95')
    for (const file of ['src/data/scores-v2.3.csv', 'src/data/scores-pros-cons.csv']) {
      const line = readFileSync(join(process.cwd(), file), 'utf8').split(/\r?\n/).find((row) => row.startsWith('semrush,'))
      expect(line, file).toContain('SEO plan costs $139 a month')
      expect(line, file).not.toContain('139.95')
    }
  })

  it('uses the monthly-billed price for Krisp, Gamma, tl;dv and Pictory', () => {
    expect(seed('krisp')).toMatchObject({ priceFromUsd: 16, lastVerifiedAt: FRESH })
    expect(seed('krisp').longDesc).toContain('Core is $16 per user a month billed monthly, or $8 billed annually.')
    expect(seed('gamma')).toMatchObject({ priceFromUsd: 12, lastVerifiedAt: FRESH })
    expect(seed('gamma').longDesc).toContain('Plus is $12 per seat a month billed monthly, or $9 billed annually')
    expect(seed('tldv')).toMatchObject({ priceFromUsd: 29, lastVerifiedAt: FRESH })
    expect(seed('tldv').longDesc).toContain('Pro is $29 per seat a month billed monthly, or $18 billed annually.')
    expect(seed('pictory')).toMatchObject({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 29, lastVerifiedAt: FRESH })
    expect(seed('pictory').longDesc).toContain('Starter is $29 a month billed monthly, or $25 billed annually.')
    for (const file of ['src/data/scores-v2.3.csv', 'src/data/scores-pros-cons.csv']) {
      const line = readFileSync(join(process.cwd(), file), 'utf8').split(/\r?\n/).find((row) => row.startsWith('pictory,'))
      expect(line, file).toContain('Starter is $29 a month billed monthly, or $25 billed yearly')
      expect(line, file).not.toContain('Starter is $25 a month billed yearly')
    }
  })

  it('prices ManyAgents at a $49 one-time license and leaves AWS Continuum paid with no flat price', () => {
    const manyagents = seed('manyagents')
    expect(manyagents).toMatchObject({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: 49, lastVerifiedAt: FRESH })
    expect(manyagents.longDesc).toContain('$49, paid once')

    const continuum = seed('aws-continuum')
    expect(continuum).toMatchObject({ pricingModel: 'paid', hasFreeTier: false, priceFromUsd: null })
    expect(continuum.pricingModel).not.toBe('')
    const source = readFileSync(join(process.cwd(), 'src/data/catalog.ts'), 'utf8')
    expect(source).toContain('https://aws.amazon.com/continuum/pricing/')
    expect(source).not.toContain('PLACEHOLDER: pricing unknown')
  })

  it('adds the freshness tools unrated, with AgentSpot on its product page', () => {
    const added = ['recursive-flint', 'gradium', 'gemini-api-cli', 'agentspot', 'sai', 'higgsfield', 'adobe-firefly']
    for (const slug of added) {
      const tool = seed(slug)
      expect(tool.addedAt, slug).toBe(FRESH)
      expect(tool.fits, slug).toEqual([])
      expect(tool.lastVerifiedAt, slug).toBe(FRESH)
      expect(tool.unlisted, slug).toBeUndefined()
    }
    expect(seed('recursive-flint').pricingModel).toBe('free')
    expect(seed('gradium')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 13, hasFreeTier: true })
    expect(seed('gemini-api-cli')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: null, hasFreeTier: true })
    expect(seed('sai')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 50, hasFreeTier: true })
    expect(seed('higgsfield')).toMatchObject({ pricingModel: 'paid', priceFromUsd: 19, hasFreeTier: false })
    expect(seed('adobe-firefly')).toMatchObject({ pricingModel: 'freemium', priceFromUsd: 9.99, hasFreeTier: true })

    const agentspot = seed('agentspot')
    expect(agentspot.url).toBe('https://www.thoughtspot.com/agentspot')
    expect(agentspot.url).not.toContain('press-releases')
    expect(agentspot).toMatchObject({ pricingModel: 'freemium', hasFreeTier: true, priceFromUsd: 1650 })
    expect(agentspot.longDesc).toContain('$1,650 a month, billed annually')
  })
})

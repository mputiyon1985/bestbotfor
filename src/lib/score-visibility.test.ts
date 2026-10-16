import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EditorialCompact, ProsConsSection, ScoreSection, StarRating } from '@/components/editorial'
import { JsonLd } from '@/components/json-ld'
import type { Catalog, CatalogTool } from './catalog-types'
import type { EditorialScore, ProCon } from './editorial'
import { pageMetadata } from './metadata'
import { ogCopy } from './og'
import { jsonLdForPage, omitScoreText, publicScore, scoresPublished } from './score-visibility'
import { SHOW_SCORES } from './site'

const editorial: EditorialScore = {
  features: 4,
  value: 4,
  ease: 5,
  quality: 4,
  overall: 4.3,
  rationale: 'Equal-weight average of features, value, ease, and quality.',
  reviewedAt: '2026-10-16',
  primaryCategory: 'chat',
  categoryRankDisplay: '#1 of 2 in Chat',
  tieGroup: '',
  tied: false,
  hideRank: false,
  note: 'regular price not published; value neutral',
  ratingStatus: 'Active',
  quizEligible: true,
}

const proText = 'Free plan includes unlimited everyday text chats.'
const conText = 'The Go plan may include ads.'
const pros: ProCon[] = [{ kind: 'pro', text: proText, sourceUrl: 'https://chatgpt.com/pricing' }]
const cons: ProCon[] = [{ kind: 'con', text: conText, sourceUrl: 'https://chatgpt.com/pricing' }]

const scoredCopy = 'ChatGPT by OpenAI. Rated 4.6 out of 5. BestBotFor score. How we score.'

function html(node: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(node)
}

function quietTool(slug: string, name: string): CatalogTool {
  return {
    id: 1,
    slug,
    name,
    vendor: name,
    url: `https://${slug}.example`,
    category: 'Chat',
    shortDesc: `${name} is rated 4.5 out of 5.`,
    longDesc: `${name} long description.`,
    pricingModel: 'freemium',
    priceFromUsd: null,
    hasFreeTier: true,
    skillLevel: 'beginner',
    platforms: ['Web'],
    lastVerifiedAt: '2026-10-16',
    fits: [],
    affiliate: {
      hasProgram: false,
      network: null,
      sourceUrl: null,
      status: 'none',
      commissionNote: null,
      affiliateUrl: null,
    },
    editorial,
    pros,
    cons,
    quizEligible: true,
  }
}

describe('SHOW_SCORES', () => {
  it('ships on, and the helper reports both states', () => {
    expect(SHOW_SCORES).toBe(true)
    expect(scoresPublished()).toBe(true)
    expect(scoresPublished(true)).toBe(true)
    expect(scoresPublished(false)).toBe(false)
  })

  it('returns the score view while the flag is on and hides it when the flag is off', () => {
    expect(publicScore(editorial, false)).toBeNull()
    expect(publicScore(null, true)).toBeNull()

    const view = publicScore(editorial)
    expect(view?.heading).toBe('BestBotFor score')
    expect(view?.overallText).toBe('4.3 out of 5')
    expect(view?.ariaLabel).toBe('Rated 4.3 out of 5')
    expect(view?.fills).toEqual([1, 1, 1, 1, 0.3])
    expect(view?.criteria.map((part) => [part.label, part.text])).toEqual([
      ['Quality', '4'],
      ['Features', '4'],
      ['Value', '4'],
      ['Ease', '5'],
    ])
    expect(view?.rationale).toBe(editorial.rationale)
  })

  it('strips score phrases from meta and open graph copy only while the flag is off', () => {
    expect(omitScoreText(scoredCopy, true)).toBe(scoredCopy)
    expect(omitScoreText(scoredCopy, false)).toBe('ChatGPT by OpenAI.')
    expect(omitScoreText('Free plan includes unlimited everyday text chats.')).toBe(
      'Free plan includes unlimited everyday text chats.',
    )

    const meta = pageMetadata({ title: 'ChatGPT', description: scoredCopy, path: '/tools/chatgpt' })
    expect(meta.description).toBe(scoredCopy)
  })

  it('never emits AggregateRating, and drops score phrases from JSON-LD only while the flag is off', () => {
    const data = {
      '@type': 'SoftwareApplication',
      name: 'ChatGPT',
      description: scoredCopy,
      aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.6', bestRating: '5' },
    }
    const shown = jsonLdForPage(data, true)
    const shownText = JSON.stringify(shown)
    expect(shown).not.toHaveProperty('aggregateRating')
    expect(shownText).not.toContain('ratingValue')
    expect(shownText).not.toContain('bestRating')
    expect(shownText).toContain('out of 5')

    const hidden = jsonLdForPage(data, false)
    const encoded = JSON.stringify(hidden)
    expect(hidden).not.toHaveProperty('aggregateRating')
    expect(encoded).not.toContain('ratingValue')
    expect(encoded).not.toContain('bestRating')
    expect(encoded).not.toContain('out of 5')
    expect(encoded).not.toContain('BestBotFor score')
    expect(encoded).toContain('ChatGPT')

    const markup = html(createElement(JsonLd, { data, nonce: null }))
    expect(markup).not.toContain('aggregateRating')
    expect(markup).not.toContain('ratingValue')
  })

  it('keeps a score sentence in the compare preview while the flag is on', () => {
    const catalog: Catalog = {
      tasks: [],
      tools: [quietTool('chatgpt', 'ChatGPT'), quietTool('claude', 'Claude')],
    }
    const hidden = ogCopy({ kind: 'compare', pair: 'chatgpt-vs-claude' }, catalog)
    expect(hidden.title).toBe('ChatGPT vs Claude')
    expect(hidden.subtitle).toContain('out of 5')
    expect(hidden.subtitle).toContain('ChatGPT')
    expect(hidden.subtitle).toContain('Claude')
  })

  it('renders pros and cons without the score component while the flag is off', () => {
    expect(html(createElement(ScoreSection, { editorial, showScores: false }))).toBe('')
    expect(html(createElement(StarRating, { score: editorial.overall, showScores: false }))).toBe('')

    const card = html(createElement(EditorialCompact, { editorial, pros, cons, showScores: false }))
    expect(card).toContain('Pros:')
    expect(card).toContain(proText)
    expect(card).toContain('Cons:')
    expect(card).toContain(conText)
    expect(card).not.toContain('data-star-rating')
    expect(card).not.toContain('data-score-section')
    expect(card).not.toContain('BestBotFor score')
    expect(card).not.toContain('out of 5')

    const section = html(createElement(ProsConsSection, { pros, cons }))
    expect(section).toContain('Pros and cons')
    expect(section).toContain(proText)
    expect(section).toContain(conText)
    expect(section).not.toContain('BestBotFor score')
  })

  it('renders the heading, stars, numeric score, and criteria bars when the flag is on', () => {
    const section = html(createElement(ScoreSection, { editorial, showScores: true }))
    expect(section).toContain('data-score-section')
    expect(section).toContain('BestBotFor score')
    expect(section).not.toContain('How we score')
    expect(section).toContain('#1 of 2 in Chat')
    expect(section).toContain('href="/how-we-rate"')
    expect(section).toContain('4.3 out of 5')
    expect(section).toContain('Rated 4.3 out of 5')
    expect(section).toContain('data-star-fill="0.3"')
    expect(section).toContain('data-criterion="quality"')
    expect(section).toContain('Quality 4 out of 5')
    expect(section).toContain('Ease 5 out of 5')
    expect(section).toContain('data-score-note')
    expect(section).toContain(editorial.note)
    expect(section).toContain(editorial.rationale)
    expect(section).not.toContain('chatgpt.com/pricing')
    expect(section).not.toContain('evidence.jsonl')

    const card = html(createElement(EditorialCompact, { editorial, pros, cons, showScores: true }))
    expect(card).toContain('data-star-rating')
    expect(card).toContain('Rated 4.3 out of 5')
    expect(card).toContain('#1 of 2 in Chat')
    expect(card).toContain('Pros:')
    expect(card).toContain(proText)
    expect(card).not.toContain('chatgpt.com/pricing')
    expect(card).not.toContain('data-score-section')
    expect(card).not.toContain('data-criterion')
  })
})

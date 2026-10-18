import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { comparePairSeeds, toolSeeds } from '@/data/catalog'
import {
  DEEPGRAM_PRICE_PRO,
  DEEPGRAM_PRICE_PRO_STALE,
  N8N_PRICE_LABEL,
} from '@/data/catalog-corrections'
import {
  COMPARE_SECONDARY_NOTE,
  compareCopy,
  comparePageCheckedLine,
  curatedCompareRedirects,
  reversedCuratedComparePath,
} from '@/data/compare-copy'
import { editorialSeeds } from '@/data/scores-pros-cons.seed'
import { a2CorrectionPlan } from '../../scripts/a2-catalog-corrections'
import { catalogFromSeeds } from '@/test/catalog-from-seeds'
import { comparisonRows, comparisonSummary } from './compare'
import { compareCostAnswer, compareFaqs, compareView } from './compare-copy'
import { faqJsonLd } from './jsonld'
import ComparePage, { generateMetadata as compareMetadata } from '@/app/compare/[pair]/page'
import { priceLabel } from './format'
import { QUIZ_RESULT_COUNT } from './scoring'

const CHECKED_TAIL = "Prices change, so confirm on the vendor's site before you pay."

/** Earliest vendor check when the page's sources differ; the shared date when they agree. */
const CHECKED_ON: Record<string, string> = {
  'elevenlabs-vs-murf': 'Oct 17, 2026',
  'n8n-vs-make': 'Oct 17, 2026',
  'heygen-vs-synthesia': 'Oct 17, 2026',
  'descript-vs-runway': 'Oct 17, 2026',
  'granola-vs-fathom': 'Oct 17, 2026',
  'fathom-vs-fireflies': 'Oct 17, 2026',
  'lovable-vs-v0': 'Oct 18, 2026',
  'assemblyai-vs-deepgram': 'Oct 17, 2026',
}

const LENGTHS: Record<string, readonly [number, number]> = {
  'elevenlabs-vs-murf': [57, 127],
  'n8n-vs-make': [52, 130],
  'heygen-vs-synthesia': [57, 133],
  'descript-vs-runway': [58, 141],
  'granola-vs-fathom': [55, 142],
  'fathom-vs-fireflies': [57, 133],
  'lovable-vs-v0': [53, 138],
  'assemblyai-vs-deepgram': [58, 146],
}

function viewFor(slug: string, today = '2026-10-17', showScores = true) {
  const [leftSlug, rightSlug] = slug.split('-vs-')
  const catalog = catalogFromSeeds()
  const left = catalog.tools.find((tool) => tool.slug === leftSlug)
  const right = catalog.tools.find((tool) => tool.slug === rightSlug)
  expect(left, leftSlug).toBeTruthy()
  expect(right, rightSlug).toBeTruthy()
  if (!left || !right) throw new Error(slug)
  const view = compareView(left, right, { today, showScores })
  expect(view, slug).toBeTruthy()
  if (!view) throw new Error(slug)
  return { left, right, view }
}

function redirectTarget(error: unknown): { url: string; status: number } | null {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return null
  const digest = String((error as { digest: unknown }).digest)
  const parts = digest.split(';')
  if (parts[0] !== 'NEXT_REDIRECT') return null
  return { url: parts.slice(2, -2).join(';'), status: Number(parts.at(-2)) }
}

function cell(view: ReturnType<typeof viewFor>['view'], label: string) {
  const row = view.rows.find((item) => item.label === label)
  expect(row, label).toBeTruthy()
  if (!row) throw new Error(label)
  return row
}

describe('curated compare copy', () => {
  it('covers the four refreshed pairs and the four new sitemap pairs', () => {
    expect(compareCopy.map((entry) => entry.slug)).toEqual([
      'elevenlabs-vs-murf',
      'n8n-vs-make',
      'heygen-vs-synthesia',
      'descript-vs-runway',
      'granola-vs-fathom',
      'fathom-vs-fireflies',
      'lovable-vs-v0',
      'assemblyai-vs-deepgram',
    ])
    const seeded = comparePairSeeds.map(([left, right]) => `${left}-vs-${right}`)
    for (const slug of compareCopy.map((entry) => entry.slug)) expect(seeded).toContain(slug)
    expect(comparePairSeeds.slice(-4)).toEqual([
      ['granola', 'fathom'],
      ['fathom', 'fireflies'],
      ['lovable', 'v0'],
      ['assemblyai', 'deepgram'],
    ])
    expect(QUIZ_RESULT_COUNT).toBe(7)
  })

  it('keeps meta titles at or under 60 characters and descriptions at or under 155', () => {
    for (const entry of compareCopy) {
      const expected = LENGTHS[entry.slug]
      expect(expected, entry.slug).toBeTruthy()
      expect(entry.metaTitle.length, entry.metaTitle).toBe(expected?.[0])
      expect(entry.metaDescription.length, entry.metaDescription).toBe(expected?.[1])
      expect(entry.metaTitle.length, entry.slug).toBeLessThanOrEqual(60)
      expect(entry.metaDescription.length, entry.slug).toBeLessThanOrEqual(155)
      expect(entry.checkedLine).toBe(`Last checked ${CHECKED_ON[entry.slug]}. ${CHECKED_TAIL}`)
      expect(entry.checkedLine).toBe(comparePageCheckedLine(entry.sources))
    }
  })

  it('fills fit scores and ratings from the catalog, including an unrated pair', () => {
    const voice = viewFor('elevenlabs-vs-murf')
    expect(voice.view.verdictPlain).toContain('96 vs 84')
    expect(cell(voice.view, 'Our rating')).toMatchObject({
      a: '4.3 (#1 of 6 in Voice)',
      b: '3.6 (#4 of 6 in Voice)',
    })
    expect(cell(voice.view, 'Fit: create a voiceover')).toMatchObject({ a: '96', b: '84' })

    const automation = viewFor('n8n-vs-make')
    expect(cell(automation.view, 'Fit: automate a workflow')).toMatchObject({ a: '90', b: '92' })
    expect(cell(automation.view, 'Fit: build an agent')).toMatchObject({ a: '74', b: 'Not ranked' })
    expect(cell(automation.view, 'Our rating').a).toBe('4.1 (#1 of 7 in Automation)')
    expect(cell(automation.view, 'Our rating').b).toBe('3.2 (#5 of 7 in Automation)')

    const avatars = viewFor('heygen-vs-synthesia')
    expect(avatars.view.verdictPlain).toContain('90 vs 88')
    expect(cell(avatars.view, 'Our rating').a).toBe('3.7 (#7 of 8 in Video (editors & avatars))')
    expect(cell(avatars.view, 'Our rating').b).toBe('3.7 (#6 of 8 in Video (editors & avatars))')
    expect(cell(avatars.view, 'Fit: make a video')).toMatchObject({ a: '88', b: '90' })

    const video = viewFor('descript-vs-runway')
    expect(video.view.verdictPlain.startsWith('They do different jobs.')).toBe(true)
    expect(video.view.verdictPlain).toContain('fit 92')
    expect(video.view.verdictPlain).not.toContain('stronger pick for create a voiceover')
    expect(cell(video.view, 'Our rating').a).toBe('4.1 (#2 of 8 in Video (editors & avatars))')
    expect(cell(video.view, 'Our rating').b).toBe('3.5 (#1 of 3 in Video (generators))')
    const auto = comparisonSummary(video.left, video.right, comparisonRows(video.left, video.right))
    expect(auto).toContain('Descript is the stronger pick for create a voiceover')

    const meetings = viewFor('granola-vs-fathom')
    expect(cell(meetings.view, 'Fit: take meeting notes')).toMatchObject({ a: '86', b: '86' })
    expect(meetings.view.ranking?.href).toBe('/best/meetings')

    const notetakers = viewFor('fathom-vs-fireflies')
    expect(notetakers.view.heading).toBe('Fathom vs Fireflies')
    expect(notetakers.view.slug).toBe('fathom-vs-fireflies')
    expect(cell(notetakers.view, 'Fit: take meeting notes')).toMatchObject({ a: '86', b: '88' })
    expect(cell(notetakers.view, 'Our rating').b).toBe('4.1 (#2 of 7 in Meetings)')

    const builders = viewFor('lovable-vs-v0')
    expect(builders.view.verdictPlain).toContain('fit 94')
    expect(builders.view.pickB.join(' ')).toContain('at 80')
    expect(cell(builders.view, 'Fit: build an app from a prompt')).toMatchObject({ a: '94', b: '84' })
    expect(cell(builders.view, 'Fit: build a website')).toMatchObject({ a: '78', b: '80' })

    const speech = viewFor('assemblyai-vs-deepgram')
    expect(speech.view.verdictPlain).not.toContain('scores higher')
    expect(cell(speech.view, 'Our rating')).toMatchObject({ a: 'Not yet rated', b: 'Not yet rated' })
    expect(cell(speech.view, 'Skill level')).toMatchObject({ a: 'Advanced', b: 'Advanced' })
    expect(speech.view.rows.some((row) => row.label.startsWith('Fit:'))).toBe(false)
    expect(COMPARE_SECONDARY_NOTE).toBe(
      "[S] = secondary source (third party), not read directly on the vendor's page.",
    )
    expect(COMPARE_SECONDARY_NOTE).not.toContain('Confirm before publishing')
    for (const entry of compareCopy) {
      expect(entry.secondaryNote, entry.slug).toBe(COMPARE_SECONDARY_NOTE)
      expect(entry.sources.join('\n'), entry.slug).toContain('src/data/scores-v2.3.csv')
      expect(entry.sources.join('\n'), entry.slug).not.toContain('catalog/scores-v2/scores-v2.3.csv')
    }

    expect(cell(voice.view, 'Free plan').b).not.toContain('[S]')
    expect(cell(voice.view, 'Paid from').b).not.toContain('[S]')
    expect(cell(automation.view, 'Paid from').b).toContain('[S]')
    for (const rendered of [voice, automation]) {
      const faqs = compareFaqs({
        nameA: rendered.view.nameA,
        nameB: rendered.view.nameB,
        verdict: rendered.view.verdictPlain,
        cost: compareCostAnswer(rendered.view, {
          nameA: rendered.view.nameA,
          priceA: 'unused',
          nameB: rendered.view.nameB,
          priceB: 'unused',
        }),
      })
      expect(JSON.stringify(faqJsonLd(faqs)), rendered.view.slug).not.toContain('[S]')
    }

    for (const slug of Object.keys(LENGTHS)) {
      const rendered = viewFor(slug)
      expect(rendered.view.verdict, slug).not.toMatch(/\{\{/)
      expect(rendered.view.pickA.join(' '), slug).not.toMatch(/\{\{/)
      expect(rendered.view.pickB.join(' '), slug).not.toMatch(/\{\{/)
    }

    const hidden = viewFor('elevenlabs-vs-murf', '2026-10-17', false)
    expect(hidden.view.rows.some((row) => row.label === 'Our rating')).toBe(false)
    expect(cell(hidden.view, 'Fit: create a voiceover').a).toBe('96')
  })

  it('sends a reversed curated pair to the hand-checked order', async () => {
    const redirects = curatedCompareRedirects()
    expect(redirects).toHaveLength(compareCopy.length)
    for (const redirect of redirects) {
      expect(redirect.permanent).toBe(true)
      const pair = redirect.source.slice('/compare/'.length)
      expect(reversedCuratedComparePath(pair)).toBe(redirect.destination)
      expect(reversedCuratedComparePath(redirect.destination.slice('/compare/'.length))).toBeNull()
    }
    expect(reversedCuratedComparePath('runway-vs-descript')).toBe('/compare/descript-vs-runway')
    expect(reversedCuratedComparePath('make-vs-n8n')).toBe('/compare/n8n-vs-make')
    expect(reversedCuratedComparePath('deepgram-vs-assemblyai')).toBe('/compare/assemblyai-vs-deepgram')
    expect(reversedCuratedComparePath('claude-vs-chatgpt')).toBeNull()
    expect(reversedCuratedComparePath('make-vs-zapier')).toBeNull()

    for (const pair of ['runway-vs-descript', 'make-vs-n8n', 'deepgram-vs-assemblyai']) {
      const target = reversedCuratedComparePath(pair)
      for (const load of [compareMetadata, ComparePage]) {
        const error = await load({ params: Promise.resolve({ pair }) }).then(
          () => null,
          (caught: unknown) => caught,
        )
        expect(redirectTarget(error), pair).toEqual({ url: target, status: 308 })
      }
    }
  })

  it('links each compare page to its matching best guide', () => {
    const ranking: Record<string, string> = {
      'elevenlabs-vs-murf': '/best/voice',
      'n8n-vs-make': '/best/automation',
      'heygen-vs-synthesia': '/best/video',
      'descript-vs-runway': '/best/video',
      'granola-vs-fathom': '/best/meetings',
      'fathom-vs-fireflies': '/best/meetings',
      'lovable-vs-v0': '/best/vibe-coding',
      'assemblyai-vs-deepgram': '/best/voice',
    }
    for (const entry of compareCopy) {
      const rendered = viewFor(entry.slug)
      expect(rendered.view.ranking?.href, entry.slug).toBe(ranking[entry.slug])
      expect(rendered.view.ranking?.label, entry.slug).toMatch(/^See the full .+ ranking$/)
    }
  })

  it('uses the earliest vendor check date when a page’s sources differ', () => {
    const tail = CHECKED_TAIL
    expect(
      comparePageCheckedLine([
        'ElevenLabs pricing (vendor, checked Oct 17, 2026)',
        'Murf pricing (vendor, checked Oct 18, 2026)',
        'Murf Studio (third party, read Oct 12 and Oct 2, 2026; Creator price re-checked Oct 18, 2026)',
        'BestBotFor catalog, read Oct 17, 2026',
      ]),
    ).toBe(`Last checked Oct 17, 2026. ${tail}`)
    expect(
      comparePageCheckedLine([
        'Lovable pricing (vendor, checked Oct 18, 2026)',
        'v0 pricing (vendor, checked Oct 18, 2026)',
      ]),
    ).toBe(`Last checked Oct 18, 2026. ${tail}`)
    expect(
      comparePageCheckedLine([
        'AssemblyAI pricing (vendor, checked Oct 17, 2026 (page says last updated Sep 28, 2026))',
        'Deepgram pricing (vendor, checked Oct 17, 2026)',
      ]),
    ).toBe(`Last checked Oct 17, 2026. ${tail}`)
  })

  it('uses Nova’s Oct 18, 2026 price re-check', () => {
    const makeView = viewFor('n8n-vs-make').view
    expect(makeView.pickB.join(' ')).toContain('3,500+ apps')
    expect(makeView.pickB.join(' ')).not.toContain('1,000+ app integrations')
    const make = cell(makeView, 'Paid from').b
    expect(make).toContain('Core $12/mo billed yearly, or $16 monthly')
    expect(make).toContain('Pro $21/mo billed yearly, or $28 monthly')
    expect(make).toContain('Teams $38/mo billed yearly, or $51 monthly')
    expect(make).not.toContain('$9/mo')
    expect(make).not.toContain('10.59')

    const murf = cell(viewFor('elevenlabs-vs-murf').view, 'Paid from').b
    expect(murf).toContain('$29/mo')
    expect(murf).toContain('$19/mo billed yearly')

    const builders = viewFor('lovable-vs-v0').view
    expect(cell(builders, 'Paid from').a).toContain('Pro $25/mo')
    expect(cell(builders, 'Paid from').a).toContain('$21/mo billed yearly')
    expect(cell(builders, 'Business tier').a).toBe('Business $50/mo, or $42/mo billed yearly')
    expect(cell(builders, 'Paid from').b).toBe('Plus $30 (shown reduced from $90)')
    expect(cell(builders, 'Business tier').b).not.toContain('$90')

    expect(cell(viewFor('heygen-vs-synthesia').view, 'Paid from').b).toBe('Starter $29/mo billed monthly')
  })

  it('drops the ElevenLabs first-month promo after Oct 18, 2026', () => {
    const during = viewFor('elevenlabs-vs-murf', '2026-10-18')
    expect(cell(during.view, 'Paid from').a).toContain('first month $1 until Oct 18')
    const after = viewFor('elevenlabs-vs-murf', '2026-10-19')
    expect(cell(after.view, 'Paid from').a).toBe('Starter $6/mo; Creator $22/mo')
    expect(cell(after.view, 'Paid from').a).not.toContain('$1')
  })
})

describe('catalog corrections', () => {
  it('gives Synthesia a free plan, keeps n8n free only as self-hosted, and refreshes Deepgram', () => {
    const synthesia = toolSeeds.find((tool) => tool.slug === 'synthesia')
    const n8n = toolSeeds.find((tool) => tool.slug === 'n8n')
    const deepgram = toolSeeds.find((tool) => tool.slug === 'deepgram')
    expect(synthesia?.hasFreeTier).toBe(true)
    expect(synthesia?.pricingModel).toBe('freemium')
    expect(priceLabel(synthesia ?? { pricingModel: 'paid', hasFreeTier: false, priceFromUsd: null })).toBe(
      'Free tier, paid plans available',
    )
    expect(n8n?.hasFreeTier).toBe(true)
    expect(n8n?.longDesc).toContain('no free cloud plan')
    expect(n8n?.longDesc).toContain('€20')
    expect(priceLabel({ slug: 'n8n', pricingModel: 'freemium', hasFreeTier: true, priceFromUsd: null })).toBe(N8N_PRICE_LABEL)
    expect(deepgram?.longDesc).toContain('$0.0043')
    expect(deepgram?.longDesc).toContain('$0.0048')
    expect(deepgram?.longDesc).not.toContain('0.006')

    const points = editorialSeeds.find((row) => row.slug === 'deepgram')
    expect(points?.pros.map((point) => point.text)).toContain(DEEPGRAM_PRICE_PRO)
    expect(points?.pros.map((point) => point.text).join('\n')).not.toContain(DEEPGRAM_PRICE_PRO_STALE)
    const v23 = readFileSync(path.join(process.cwd(), 'src/data/scores-v2.3.csv'), 'utf8')
    expect(v23).toContain(DEEPGRAM_PRICE_PRO)
    expect(v23).not.toContain(DEEPGRAM_PRICE_PRO_STALE)
  })

  it('plans the production script from the seed and does not treat the n8n label as a column', () => {
    const plan = a2CorrectionPlan()
    expect(plan.n8nPriceLabel).toBe(N8N_PRICE_LABEL)
    expect(plan.n8nPriceLabelStoredInDb).toBe(false)
    expect(plan.deepgramPro.to).toBe(DEEPGRAM_PRICE_PRO)
    const synthesia = plan.tools.find((tool) => tool.slug === 'synthesia')
    expect(synthesia?.hasFreeTier).toBe(true)
    expect(synthesia?.pricingModel).toBe('freemium')
    const n8n = plan.tools.find((tool) => tool.slug === 'n8n')
    expect(n8n?.hasFreeTier).toBe(true)
    expect(n8n?.longDesc).toContain('€20')
  })
})

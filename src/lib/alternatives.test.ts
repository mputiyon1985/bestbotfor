import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { catalogFromSeeds } from '@/test/catalog-from-seeds'
import {
  ALTERNATIVE_PAGES,
  ALTERNATIVES_COUNT,
  alternativesBudgetPath,
  alternativesDescription,
  alternativesForTask,
  alternativesTitle,
  comparePairsFor,
  getAlternativePage,
  parseAlternativeBudget,
  rankAlternatives,
} from './alternatives'
import { listMatches } from './matches'
import { ALTERNATIVES_NEWSLETTER_TOOLS, alternativesNewsletterSource, newsletterReferringPath } from './newsletter-source'
import { NEWSLETTER_SIGNUP_PARAGRAPH } from './privacy-copy'
import { toolsForTask } from './recommend'
import { MIN_QUIZ_FIT_SCORE } from './scoring'
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from './seo-pages'

vi.mock('@/lib/catalog', () => ({ listPublicSlugs: async () => ({ tasks: [], tools: [] }) }))

const catalog = catalogFromSeeds()
const source = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8')

describe('alternatives pages', () => {
  it('covers the five spec pages, each tool fitting its job', () => {
    expect(ALTERNATIVE_PAGES.map((page) => `/alternatives/${page.tool}`)).toEqual([
      '/alternatives/chatgpt',
      '/alternatives/midjourney',
      '/alternatives/zapier',
      '/alternatives/cursor',
      '/alternatives/elevenlabs',
      '/alternatives/jasper',
      '/alternatives/perplexity',
      '/alternatives/heygen',
      '/alternatives/lovable',
      '/alternatives/fathom',
      '/alternatives/surfer',
    ])
    for (const page of ALTERNATIVE_PAGES) {
      expect(toolsForTask(catalog, page.task).some((tool) => tool.slug === page.tool), page.tool).toBe(true)
      expect(alternativesForTask(page.task)).toBe(page)
    }
    expect(getAlternativePage('notion-ai')).toBeUndefined()
  })

  it('uses the spec head copy inside the limits', () => {
    for (const page of ALTERNATIVE_PAGES) {
      const tool = catalog.tools.find((item) => item.slug === page.tool)!
      const task = catalog.tasks.find((item) => item.slug === page.task)!
      expect(alternativesTitle(tool.name).length).toBeLessThanOrEqual(SEO_TITLE_MAX)
      expect(alternativesDescription(tool.name, task.name).length).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX)
    }
    expect(alternativesTitle('ChatGPT')).toBe('ChatGPT Alternatives (2026): Best Picks by Budget')
    expect(alternativesDescription('ChatGPT')).toBe(
      'The best ChatGPT alternatives, ranked by fit and filtered by budget. Free options included. Or get your pick in 30 seconds.',
    )
    expect(alternativesDescription('Cursor', 'Write code')).toContain('Cursor alternatives for writing code')
  })

  it('ranks up to six tools by the match % on the page, never the tool itself, all clearing the fit floor', () => {
    for (const page of ALTERNATIVE_PAGES) {
      const candidates = toolsForTask(catalog, page.task)
      for (const budget of ['any', 'free', 'low'] as const) {
        const ranked = rankAlternatives(candidates, page.tool, budget)
        expect(ranked.length).toBeLessThanOrEqual(ALTERNATIVES_COUNT)
        expect(ranked.map((tool) => tool.slug)).not.toContain(page.tool)
        for (const tool of ranked) expect(tool.fitScore).toBeGreaterThanOrEqual(MIN_QUIZ_FIT_SCORE)
        const eligible = listMatches(
          candidates.filter((tool) => tool.slug !== page.tool),
          budget,
        )
        const byMatch = eligible
          .slice()
          .sort((a, b) => b.fitScore - a.fitScore || a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug))
          .slice(0, ALTERNATIVES_COUNT)
        expect(ranked.map((tool) => tool.slug)).toEqual(byMatch.map((tool) => tool.slug))
        for (let index = 1; index < ranked.length; index++) {
          const previous = ranked[index - 1]!
          const next = ranked[index]!
          expect(previous.fitScore, page.tool).toBeGreaterThanOrEqual(next.fitScore)
        }
      }
      expect(rankAlternatives(candidates, page.tool, 'any').length, page.tool).toBeGreaterThanOrEqual(3)
    }
  })

  it('lists ElevenLabs and Cursor alternatives best to worst by the match % the page shows', () => {
    // Live bug, 2026-11-05: skill adjustment (beginner +12, intermediate 0) ordered these
    // by a score the page does not print. The row shows fitScore as "{n}% match".
    const voice = rankAlternatives(toolsForTask(catalog, 'voice'), 'elevenlabs', 'any')
    const wellsaid = voice.findIndex((tool) => tool.slug === 'wellsaid')
    const fish = voice.findIndex((tool) => tool.slug === 'fish-audio')
    expect(voice[wellsaid]?.fitScore).toBe(82)
    expect(voice[fish]?.fitScore).toBe(76)
    expect(wellsaid).toBeGreaterThanOrEqual(0)
    expect(fish).toBeGreaterThan(wellsaid)
    const speechify = voice.findIndex((tool) => tool.slug === 'speechify')
    const typecast = voice.findIndex((tool) => tool.slug === 'typecast')
    expect(voice[speechify]?.fitScore).toBe(voice[typecast]?.fitScore)
    expect(typecast).toBeGreaterThan(speechify)
    expect(voice.map((tool) => tool.fitScore)).toEqual([84, 82, 80, 76, 74, 74])

    const coding = rankAlternatives(toolsForTask(catalog, 'coding'), 'cursor', 'any')
    const codex = coding.find((tool) => tool.slug === 'openai-codex')
    expect(codex?.fitScore).toBe(90)
    // Claude is 80% for coding. It used to sit above Codex. It is outside the six highest matches.
    expect(coding.some((tool) => tool.slug === 'claude')).toBe(false)
    expect(coding.map((tool) => tool.slug)).toEqual([
      'claude-code',
      'github-copilot',
      'openai-codex',
      'cline',
      'windsurf',
      'augment-code',
    ])
    expect(coding.map((tool) => tool.fitScore)).toEqual([94, 92, 90, 88, 88, 86])
    const cline = coding.findIndex((tool) => tool.slug === 'cline')
    const devin = coding.findIndex((tool) => tool.slug === 'windsurf')
    expect(coding[cline]?.fitScore).toBe(coding[devin]?.fitScore)
    expect(devin).toBeGreaterThan(cline)
  })

  it('parses budget chips and rejects anything else', () => {
    expect(parseAlternativeBudget(undefined)).toBe('any')
    expect(parseAlternativeBudget('free')).toBe('free')
    expect(parseAlternativeBudget('low')).toBe('low')
    expect(parseAlternativeBudget('any')).toBe('any')
    expect(parseAlternativeBudget('cheap')).toBeNull()
    expect(parseAlternativeBudget(['free', 'low'])).toBeNull()
    expect(alternativesBudgetPath('chatgpt', 'any')).toBe('/alternatives/chatgpt')
    expect(alternativesBudgetPath('chatgpt', 'free')).toBe('/alternatives/chatgpt?budget=free')
  })

  it('gives every page its own newsletter source, named in the privacy policy', () => {
    // Starter pages added Oct 21 have no signup form until the privacy policy names them.
    for (const page of ALTERNATIVE_PAGES.filter((entry) => (ALTERNATIVES_NEWSLETTER_TOOLS as readonly string[]).includes(entry.tool))) {
      const source = alternativesNewsletterSource(page.tool)
      expect(source, page.tool).not.toBeNull()
      expect(newsletterReferringPath(source!)).toBe(`/alternatives/${page.tool}`)
      expect(NEWSLETTER_SIGNUP_PARAGRAPH).toContain(`/alternatives/${page.tool}`)
    }
    expect(ALTERNATIVES_NEWSLETTER_TOOLS).toEqual(ALTERNATIVE_PAGES.slice(0, 5).map((page) => page.tool))
    const template = source('src/app/alternatives/[tool]/page.tsx')
    expect(template).toContain('alternativesNewsletterSource(subject.slug)')
    expect(template).not.toContain('source="best"')
  })

  it('finds compare pairs that include the tool', () => {
    for (const [left, right] of comparePairsFor('elevenlabs')) expect([left, right]).toContain('elevenlabs')
    expect(comparePairsFor('elevenlabs').some(([l, r]) => l === 'elevenlabs' && r === 'murf')).toBe(true)
  })

  it('is in the sitemap and linked from tool profiles and best guides', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const urls = (await sitemap()).map((entry) => new URL(entry.url).pathname)
    for (const page of ALTERNATIVE_PAGES) expect(urls).toContain(`/alternatives/${page.tool}`)
    expect(source('src/app/tools/[slug]/page.tsx')).toContain('Alternatives to {tool.name}')
    expect(source('src/app/best/[task]/page.tsx')).toContain('alternativesPath(alternatives.slug)')
    expect(source('src/app/alternatives/[tool]/page.tsx')).not.toContain('Sponsored')
  })
})

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

  it('ranks up to six tools like /result, never the tool itself, all clearing the fit floor', () => {
    for (const page of ALTERNATIVE_PAGES) {
      const candidates = toolsForTask(catalog, page.task)
      for (const budget of ['any', 'free', 'low'] as const) {
        const ranked = rankAlternatives(candidates, page.tool, budget)
        expect(ranked.length).toBeLessThanOrEqual(ALTERNATIVES_COUNT)
        expect(ranked.map((tool) => tool.slug)).not.toContain(page.tool)
        for (const tool of ranked) expect(tool.fitScore).toBeGreaterThanOrEqual(MIN_QUIZ_FIT_SCORE)
        const expected = listMatches(candidates.filter((tool) => tool.slug !== page.tool), budget).slice(0, ALTERNATIVES_COUNT)
        expect(ranked.map((tool) => tool.slug)).toEqual(expected.map((tool) => tool.slug))
      }
      expect(rankAlternatives(candidates, page.tool, 'any').length, page.tool).toBeGreaterThanOrEqual(3)
    }
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
    for (const page of ALTERNATIVE_PAGES) {
      const source = alternativesNewsletterSource(page.tool)
      expect(source, page.tool).not.toBeNull()
      expect(newsletterReferringPath(source!)).toBe(`/alternatives/${page.tool}`)
      expect(NEWSLETTER_SIGNUP_PARAGRAPH).toContain(`/alternatives/${page.tool}`)
    }
    expect(ALTERNATIVES_NEWSLETTER_TOOLS).toEqual(ALTERNATIVE_PAGES.map((page) => page.tool))
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

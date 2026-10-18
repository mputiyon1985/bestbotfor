import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { GUIDES, getGuide, guidePath } from '@/content/guides'
import { taskSeeds, toolSeeds } from '@/data/catalog'
import { toolsForTask } from './recommend'
import { catalogFromSeeds } from '@/test/catalog-from-seeds'
import {
  BEST_HUB_DESCRIPTION,
  BEST_HUB_TITLE,
  CATALOG_TASK_COUNT,
  CATALOG_TOOL_COUNT,
  LOADOUT_DESCRIPTION,
  LOADOUT_TITLE,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  hubRows,
  jobLabel,
} from './seo-pages'

vi.mock('@/lib/catalog', () => ({
  listPublicSlugs: async () => ({ tasks: ['coding'], tools: ['cursor'] }),
}))

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), 'utf8')
}

describe('seo hub head copy', () => {
  it('keeps titles and descriptions inside the spec limits', () => {
    const heads = [
      [BEST_HUB_TITLE, BEST_HUB_DESCRIPTION],
      [LOADOUT_TITLE, LOADOUT_DESCRIPTION],
      ...GUIDES.map((guide) => [guide.title, guide.description]),
    ]
    for (const [title, description] of heads) {
      expect(title!.length, title).toBeLessThanOrEqual(SEO_TITLE_MAX)
      expect(description!.length, description).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX)
    }
  })

  it('uses the spec head copy for the Loadout and the guide, with counts from the catalog', () => {
    expect(CATALOG_TASK_COUNT).toBe(taskSeeds.length)
    expect(CATALOG_TOOL_COUNT).toBe(toolSeeds.length)
    expect(LOADOUT_TITLE).toBe(`The AI Loadout: The Best AI Tool for All ${taskSeeds.length} Jobs`)
    expect(LOADOUT_DESCRIPTION).toContain(`from our catalog of ${toolSeeds.length} tools`)
    const guide = getGuide('how-to-choose-an-ai-tool')
    expect(guide?.title).toBe('How to Choose an AI Tool: 3 Questions That Decide It')
    expect(guide?.heading).toBe('How to choose an AI tool')
  })
})

describe('hub rows', () => {
  it('takes the first-ranked tool for each task, the same order /best/[task] uses', () => {
    const catalog = catalogFromSeeds()
    const ranked = new Map(catalog.tasks.map((task) => [task.slug, toolsForTask(catalog, task.slug)]))
    const rows = hubRows(catalog.tasks, ranked)
    expect(rows).toHaveLength(taskSeeds.length)
    for (const row of rows) expect(row.pick?.slug).toBe(toolsForTask(catalog, row.taskSlug)[0]?.slug)
  })

  it('leaves a task without candidates empty instead of inventing a pick', () => {
    expect(hubRows([{ slug: 'x', name: 'Write code' }], new Map())).toEqual([{ taskSlug: 'x', taskName: 'Write code', pick: null }])
  })

  it('labels jobs as gerunds', () => {
    expect(jobLabel('Write code')).toBe('Writing code')
  })
})

describe('how-to-choose guide', () => {
  const guide = getGuide('how-to-choose-an-ai-tool')!

  it('opens with a 40 to 60 word answer that starts with the job', () => {
    const words = guide.answer.split(/\s+/).filter(Boolean).length
    expect(words).toBeGreaterThanOrEqual(40)
    expect(words).toBeLessThanOrEqual(60)
    expect(guide.answer.startsWith('Start with the job, then your budget, then your experience.')).toBe(true)
  })

  it('covers the outline: three questions, fit, mistakes and three FAQs', () => {
    const headings = guide.sections.map((section) => section.heading)
    expect(headings).toEqual([
      'Question 1: What do you want to do?',
      'Question 2: What can you spend?',
      'Question 3: How experienced are you?',
      'How we score fit',
      'Common mistakes',
    ])
    expect(guide.sections.find((section) => section.id === 'budget')?.terms?.map((item) => item.term)).toEqual(['Free only', 'Low cost', 'Any budget'])
    expect(guide.sections.find((section) => section.id === 'experience')?.terms?.map((item) => item.term)).toEqual(['Beginner', 'Intermediate', 'Advanced'])
    expect(guide.faqs).toHaveLength(3)
  })

  it('links /how-we-rate and /tools and states no prices', () => {
    const links = guide.sections.flatMap((section) => (section.link ? [section.link.href] : []))
    expect(links).toEqual(['/how-we-rate', '/tools'])
    expect(JSON.stringify(guide)).not.toMatch(/\$\d/)
  })

  it('returns undefined for unknown guides', () => {
    expect(getGuide('nope')).toBeUndefined()
    expect(guidePath('how-to-choose-an-ai-tool')).toBe('/guides/how-to-choose-an-ai-tool')
  })
})

describe('sitemap and internal links', () => {
  it('lists the hub, the Loadout and every guide', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const urls = (await sitemap()).map((entry) => new URL(entry.url).pathname)
    expect(urls).toContain('/best')
    expect(urls).toContain('/ai-loadout')
    for (const guide of GUIDES) expect(urls).toContain(guidePath(guide.slug))
  })

  it('links the guide, the Loadout and the hub from every best guide, the footer and the newsletter page', () => {
    const best = source('src/app/best/[task]/page.tsx')
    expect(best).toContain("guidePath('how-to-choose-an-ai-tool')")
    expect(best).toContain('href={LOADOUT_PATH}')
    expect(best).toContain('href={BEST_HUB_PATH}')
    const footer = source('src/components/site-footer.tsx')
    expect(footer).toContain('href="/guides/how-to-choose-an-ai-tool"')
    expect(footer).toContain('href="/ai-loadout"')
    expect(source('src/app/newsletter/page.tsx')).toContain('href="/ai-loadout"')
  })

  it('keeps sponsored placements off the new templates', () => {
    for (const file of ['src/app/best/page.tsx', 'src/app/ai-loadout/page.tsx', 'src/app/guides/[slug]/page.tsx']) {
      const page = source(file)
      expect(page).not.toContain('SponsoredPlacement')
      expect(page).not.toContain('Sponsored')
    }
  })

  it('ships the Loadout PDF as a public file', () => {
    expect(readFileSync(path.join(process.cwd(), 'public/ai-loadout.pdf')).subarray(0, 5).toString()).toBe('%PDF-')
  })
})

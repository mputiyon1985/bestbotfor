import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { taskSeeds } from '@/data/catalog'
import { CATEGORY_GUIDES, EDITOR_BIO, categoryGuideArticleJsonLd } from '@/content/category-guides'
import { GUIDES } from '@/content/guides'
import { guideHref, parseGuideMarkdown, parseInline } from './guide-markdown'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement('a', { href, ...rest }, children as never),
}))

describe('category guides', () => {
  it('publishes the 8 guides, each for a real /best task, without clashing with other guides', () => {
    expect(CATEGORY_GUIDES.map((g) => g.category).sort()).toEqual(
      ['automation', 'coding', 'images', 'meetings', 'seo', 'video', 'voice', 'writing'],
    )
    for (const guide of CATEGORY_GUIDES) {
      expect(taskSeeds.some((task) => task.slug === guide.category)).toBe(true)
      expect(GUIDES.some((g) => g.slug === guide.category)).toBe(false)
    }
  })

  it('carries no editorial notes, draft markers or placeholder links', () => {
    for (const guide of CATEGORY_GUIDES) {
      expect(guide.body).not.toMatch(/VERIFY|EDITOR FLAG|Set A|Set B|Tony|DRAFT|link once/)
      expect(guide.body).not.toContain('By Mark Putiyon')
    }
    const meetings = CATEGORY_GUIDES.find((g) => g.category === 'meetings')!
    expect(meetings.body).not.toContain('free AI note takers guide')
  })

  it('automation shows Make Set A prices only', () => {
    const body = CATEGORY_GUIDES.find((g) => g.category === 'automation')!.body
    expect(body).toContain('| Core | $12 / $16 per month |')
    expect(body).toContain('| Pro | $21 / $28 per month |')
    expect(body).toContain('| Teams | $38 / $51 per month |')
    expect(body).not.toMatch(/\$9 \/ \$10\.59|\$16 \/ \$18\.82|\$29 \/ \$34\.12/)
  })

  it('Article JSON-LD names Mark as author', () => {
    const ld = categoryGuideArticleJsonLd(CATEGORY_GUIDES[0]!)
    expect(ld['@type']).toBe('Article')
    expect(ld.author).toMatchObject({ '@type': 'Person', name: 'Mark Putiyon', jobTitle: 'Editor-in-Chief' })
  })

  it('the guide page shows the byline, has no paywall, and /best links to the guide', () => {
    const page = readFileSync('src/app/guides/[slug]/page.tsx', 'utf8')
    expect(page).toContain('{EDITOR_BYLINE}')
    expect(page).not.toMatch(/member|paywall|signIn|auth\(/i)
    expect(readFileSync('src/app/best/[task]/page.tsx', 'utf8')).toContain('href={guidePath(task.slug)}')
    expect(readFileSync('src/app/about/page.tsx', 'utf8')).toContain('{EDITOR_BIO}')
    expect(EDITOR_BIO).toMatch(/^Mark Putiyon is Editor-in-Chief of BestBotFor\./)
    expect(EDITOR_BIO).not.toMatch(/TSI|TIP|QSS|VoltWay|LinkedIn/)
  })
})

describe('guide markdown', () => {
  it('keeps site links relative and drops unsafe schemes', () => {
    expect(guideHref('https://bestbotfor.com/best/meetings')).toEqual({ href: '/best/meetings', kind: 'internal' })
    expect(guideHref('https://bestbotfor.com/go/otter?utm_source=site')).toEqual({ href: '/go/otter?utm_source=site', kind: 'go' })
    expect(guideHref('javascript:alert(1)')).toBeNull()
    expect(guideHref('http://example.com')).toBeNull()
    expect(parseInline('[x](javascript:alert(1))')).not.toContainEqual(expect.objectContaining({ type: 'link' }))
  })

  it('parses headings, lists, tables and paragraphs', () => {
    const blocks = parseGuideMarkdown('## A\n\nText **b** *i*\n\n- one\n- two\n\n| H | I |\n|---|---|\n| 1 | 2 |\n')
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'table'])
  })

  it('renders every guide without raw HTML passthrough', async () => {
    const { GuideMarkdown } = await import('@/components/guide-markdown')
    for (const guide of CATEGORY_GUIDES) {
      const html = renderToStaticMarkup(createElement(GuideMarkdown, { markdown: guide.body }))
      expect(html).toContain('<h2')
      expect(html).not.toContain('<script')
    }
    const xss = renderToStaticMarkup(createElement(GuideMarkdown, { markdown: '<img src=x onerror=alert(1)>' }))
    expect(xss).toContain('&lt;img')
  })
})

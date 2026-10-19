import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Metadata } from 'next'
import sitemap, { SITEMAP_STATIC_PATHS } from '@/app/sitemap'
import { isProductionDeployment } from '@/lib/indexing'
import { pageMetadata } from '@/lib/metadata'
import { SITEMAP_STATIC_LASTMOD } from '@/lib/sitemap-dates'
import { GUIDES, guidePath } from '@/content/guides'

const originalVercel = process.env.VERCEL_ENV

afterEach(() => {
  if (originalVercel === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = originalVercel
})

function robotsOf(metadata: Metadata): Metadata['robots'] {
  return metadata.robots
}

async function staticRobots(route: string): Promise<Metadata['robots']> {
  if (route === '/') {
    const source = readFileSync(path.join(process.cwd(), 'src/app/layout.tsx'), 'utf8')
    expect(source).toContain(
      'robots: isProductionDeployment() ? { index: true, follow: true } : { index: false, follow: false }',
    )
    return isProductionDeployment() ? { index: true, follow: true } : { index: false, follow: false }
  }
  if (route === '/sponsor') {
    const page = await import('@/app/sponsor/page')
    return robotsOf(page.generateMetadata())
  }
  if (route.startsWith('/guides/')) {
    const slug = route.slice('/guides/'.length)
    const page = await import('@/app/guides/[slug]/page')
    return robotsOf(await page.generateMetadata({ params: Promise.resolve({ slug }) }))
  }
  if (route === '/tools') {
    const source = readFileSync(path.join(process.cwd(), 'src/app/tools/page.tsx'), 'utf8')
    const body = source.slice(source.indexOf('export async function generateMetadata'), source.indexOf('export default'))
    const returns = [...body.matchAll(/return pageMetadata\(\{[\s\S]*?\}\)/g)].map((match) => match[0])
    expect(returns.length).toBeGreaterThan(1)
    expect(returns[0]).toContain('noIndex: true')
    expect(returns.at(-1)).not.toContain('noIndex')
    return pageMetadata({ title: 'Tools', description: 'Catalog', path: '/tools' }).robots
  }

  const modules = {
    '/about': () => import('@/app/about/page'),
    '/how-we-rate': () => import('@/app/how-we-rate/page'),
    '/newsletter': () => import('@/app/newsletter/page'),
    '/disclosure': () => import('@/app/disclosure/page'),
    '/privacy': () => import('@/app/privacy/page'),
    '/terms': () => import('@/app/terms/page'),
    '/pricing': () => import('@/app/pricing/page'),
    '/best': () => import('@/app/best/page'),
    '/ai-loadout': () => import('@/app/ai-loadout/page'),
  } as const
  const key = route as keyof typeof modules
  const page = await modules[key]()
  return robotsOf(page.metadata)
}

describe('static sitemap paths', () => {
  it('lists every static path as indexable and leaves /search out', async () => {
    process.env.VERCEL_ENV = 'production'
    const urls = (await sitemap()).map((entry) => new URL(entry.url).pathname)
    expect(SITEMAP_STATIC_PATHS).not.toContain('/search')
    expect(urls).not.toContain('/search')

    const search = await import('@/app/search/page')
    expect(robotsOf(await search.generateMetadata({ searchParams: Promise.resolve({}) }))).toEqual({
      index: false,
      follow: false,
    })

    for (const route of SITEMAP_STATIC_PATHS) {
      expect(urls, route).toContain(route)
      expect(await staticRobots(route), route).toEqual({ index: true, follow: true })
    }
  })
})

describe('sitemap entries', () => {
  it('leaves out every /result match list', async () => {
    const entries = await sitemap()
    for (const entry of entries) {
      expect(entry.url).not.toContain('/result')
      expect(entry.url).not.toContain('view=all')
    }
  })

  it('gives every entry a stable YYYY-MM-DD lastmod that does not follow the clock', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2031-01-02T03:04:05Z'))
      const later = await sitemap()
      vi.setSystemTime(new Date('2027-06-07T08:09:10Z'))
      const earlier = await sitemap()
      expect(later).toEqual(earlier)
      for (const entry of later) {
        expect(String(entry.lastModified), entry.url).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(String(entry.lastModified), entry.url).not.toMatch(/^20(27|31)/)
      }
      const byPath = new Map(later.map((entry) => [new URL(entry.url).pathname, entry.lastModified]))
      expect(byPath.get('/privacy')).toBe(SITEMAP_STATIC_LASTMOD)
      for (const guide of GUIDES) expect(byPath.get(guidePath(guide.slug))).toBe(guide.updatedAt)
    } finally {
      vi.useRealTimers()
    }
  })
})

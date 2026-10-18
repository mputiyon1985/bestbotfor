import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Metadata } from 'next'
import sitemap, { SITEMAP_STATIC_PATHS } from '@/app/sitemap'
import { isProductionDeployment } from '@/lib/indexing'
import { pageMetadata } from '@/lib/metadata'

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

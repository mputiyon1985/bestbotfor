import type { MetadataRoute } from 'next'
import { comparePairSeeds } from '@/data/catalog'
import { ALTERNATIVE_PAGES, alternativesPath } from '@/lib/alternatives'
import { GUIDES, guidePath } from '@/content/guides'
import { listPublicSlugs } from '@/lib/catalog'
import { indexableMatchPath } from '@/lib/result-index'
import { getSiteUrl } from '@/lib/site'
import { loadFreePage } from '@/lib/free-page-data'
import { isFreePageTask } from '@/lib/free-plan'
import { bestFreePath } from '@/lib/seo-pages'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl()
  const staticPaths = ['/', '/about', '/how-we-rate', '/newsletter', '/disclosure', '/privacy', '/terms', '/pricing', '/sponsor', '/search', '/tools', '/best', '/ai-loadout', ...GUIDES.map((guide) => guidePath(guide.slug))]
  const entries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: new URL(path, site).toString(),
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : path === '/tools' || path === '/best' ? 0.8 : 0.6,
  }))

  try {
    const catalog = await listPublicSlugs()
    for (const slug of catalog.tasks) {
      entries.push({ url: new URL(`/best/${slug}`, site).toString(), changeFrequency: 'weekly', priority: 0.8 })
      entries.push({ url: new URL(indexableMatchPath(slug), site).toString(), changeFrequency: 'weekly', priority: 0.6 })
    }
    // Free pages follow the same rule as their robots tag: listed only when every note is fresh.
    for (const slug of catalog.tasks.filter(isFreePageTask)) {
      const page = await loadFreePage(slug)
      if (page?.indexable) entries.push({ url: new URL(bestFreePath(slug), site).toString(), changeFrequency: 'weekly', priority: 0.7 })
    }
    for (const slug of catalog.tools) {
      entries.push({ url: new URL(`/tools/${slug}`, site).toString(), changeFrequency: 'weekly', priority: 0.7 })
    }
  } catch (error) {
    console.error('sitemap catalog unavailable', error instanceof Error ? error.name : 'error')
  }

  for (const page of ALTERNATIVE_PAGES) {
    entries.push({ url: new URL(alternativesPath(page.tool), site).toString(), changeFrequency: 'weekly', priority: 0.7 })
  }

  for (const [a, b] of comparePairSeeds) {
    entries.push({
      url: new URL(`/compare/${a}-vs-${b}`, site).toString(),
      changeFrequency: 'weekly',
      priority: 0.7,
    })
  }

  return entries
}

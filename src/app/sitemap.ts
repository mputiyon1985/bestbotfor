import type { MetadataRoute } from 'next'
import { comparePairSeeds } from '@/data/catalog'
import { listPublicSlugs } from '@/lib/catalog'
import { getSiteUrl } from '@/lib/site'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl()
  const staticPaths = ['/', '/about', '/newsletter', '/disclosure', '/privacy', '/terms', '/pricing', '/search', '/tools']
  const entries: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: new URL(path, site).toString(),
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : 0.6,
  }))

  try {
    const catalog = await listPublicSlugs()
    for (const slug of catalog.tasks) {
      entries.push({ url: new URL(`/best/${slug}`, site).toString(), changeFrequency: 'weekly', priority: 0.8 })
    }
    for (const slug of catalog.tools) {
      entries.push({ url: new URL(`/tools/${slug}`, site).toString(), changeFrequency: 'weekly', priority: 0.7 })
    }
  } catch (error) {
    console.error('sitemap catalog unavailable', error instanceof Error ? error.name : 'error')
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

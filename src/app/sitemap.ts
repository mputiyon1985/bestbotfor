import type { MetadataRoute } from 'next'
import { comparePairSeeds } from '@/data/catalog'
import { ALTERNATIVE_PAGES, alternativesPath } from '@/lib/alternatives'
import { GUIDES, guidePath } from '@/content/guides'
import { CATEGORY_GUIDES } from '@/content/category-guides'
import { listPublicSlugs } from '@/lib/catalog'
import { getDb } from '@/lib/db'
import { emptySitemapDates, latestIsoDate, readSitemapDates, SITEMAP_STATIC_LASTMOD, type SitemapDates } from '@/lib/sitemap-dates'
import { getSiteUrl } from '@/lib/site'
import { loadFreePage } from '@/lib/free-page-data'
import { isFreePageTask } from '@/lib/free-plan'
import { bestFreePath } from '@/lib/seo-pages'

export const dynamic = 'force-dynamic'

/** Static sitemap paths. /search stays off this list because that page is noindex. */
export const SITEMAP_STATIC_PATHS = [
  '/',
  '/about',
  '/how-we-rate',
  '/newsletter',
  '/disclosure',
  '/privacy',
  '/terms',
  '/pricing',
  '/sponsor',
  '/tools',
  '/best',
  '/ai-loadout',
  ...GUIDES.map((guide) => guidePath(guide.slug)),
  ...CATEGORY_GUIDES.map((guide) => guidePath(guide.category)),
] as const

/** Catalog-backed hubs take the newest catalog review date. */
const CATALOG_HUB_PATHS = new Set<string>(['/', '/best', '/tools'])

function staticLastmod(path: string, dates: SitemapDates): string {
  const guide = GUIDES.find((entry) => guidePath(entry.slug) === path)
  if (guide) return latestIsoDate([guide.updatedAt]) ?? SITEMAP_STATIC_LASTMOD
  const categoryGuide = CATEGORY_GUIDES.find((entry) => guidePath(entry.category) === path)
  if (categoryGuide) return latestIsoDate([categoryGuide.checked]) ?? SITEMAP_STATIC_LASTMOD
  if (CATALOG_HUB_PATHS.has(path)) return dates.catalog ?? SITEMAP_STATIC_LASTMOD
  return SITEMAP_STATIC_LASTMOD
}

/**
 * Match lists (/result?task=...&view=all) are left out: they are noindex and
 * canonicalize to /best/<task>. lastmod comes from the catalog's reviewed
 * dates, or SITEMAP_STATIC_LASTMOD when a page has none, never the build time.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl()
  let dates = emptySitemapDates()
  try {
    dates = await readSitemapDates(getDb())
  } catch (error) {
    console.error('sitemap dates unavailable', error instanceof Error ? error.name : 'error')
  }
  const toolDate = (slug: string) => dates.tools.get(slug) ?? SITEMAP_STATIC_LASTMOD
  const taskDate = (slug: string) => dates.tasks.get(slug) ?? SITEMAP_STATIC_LASTMOD

  const entries: MetadataRoute.Sitemap = SITEMAP_STATIC_PATHS.map((path) => ({
    url: new URL(path, site).toString(),
    lastModified: staticLastmod(path, dates),
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : path === '/tools' || path === '/best' ? 0.8 : 0.6,
  }))

  try {
    const catalog = await listPublicSlugs()
    for (const slug of catalog.tasks) {
      entries.push({ url: new URL(`/best/${slug}`, site).toString(), lastModified: taskDate(slug), changeFrequency: 'weekly', priority: 0.8 })
    }
    // Free pages follow the same rule as their robots tag: listed only when every note is fresh.
    for (const slug of catalog.tasks.filter(isFreePageTask)) {
      const page = await loadFreePage(slug)
      if (page?.indexable) entries.push({ url: new URL(bestFreePath(slug), site).toString(), lastModified: taskDate(slug), changeFrequency: 'weekly', priority: 0.7 })
    }
    for (const slug of catalog.tools) {
      entries.push({ url: new URL(`/tools/${slug}`, site).toString(), lastModified: toolDate(slug), changeFrequency: 'weekly', priority: 0.7 })
    }
  } catch (error) {
    console.error('sitemap catalog unavailable', error instanceof Error ? error.name : 'error')
  }

  for (const page of ALTERNATIVE_PAGES) {
    entries.push({
      url: new URL(alternativesPath(page.tool), site).toString(),
      lastModified: latestIsoDate([dates.tools.get(page.tool), dates.tasks.get(page.task)]) ?? SITEMAP_STATIC_LASTMOD,
      changeFrequency: 'weekly',
      priority: 0.7,
    })
  }

  for (const [a, b] of comparePairSeeds) {
    entries.push({
      url: new URL(`/compare/${a}-vs-${b}`, site).toString(),
      lastModified: latestIsoDate([dates.tools.get(a), dates.tools.get(b)]) ?? SITEMAP_STATIC_LASTMOD,
      changeFrequency: 'weekly',
      priority: 0.7,
    })
  }

  return entries
}

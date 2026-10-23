import { getCatalog } from '@/lib/catalog'
import { priceLabel } from '@/lib/format'
import { LLMS_CACHE_CONTROL } from '@/lib/cdn-cache'
import { getSiteUrl, TAGLINE } from '@/lib/site'

/**
 * Rendered at request time (a build-time prerender would need a seeded DB and
 * fails in CI's pre-build test step), but the CDN caches the body for a day via
 * LLMS_CACHE_CONTROL, so crawlers hitting this file no longer reach the function
 * or Turso more than about once per day per region.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const site = getSiteUrl()
  const catalog = await getCatalog()
  const lines = [`# BestBotFor`, ``, TAGLINE, ``]
  for (const tool of catalog.tools) {
    lines.push(`## ${tool.name}`, ``, tool.longDesc, ``, `Price: ${priceLabel(tool)}`, `Profile: ${site}/tools/${tool.slug}`, ``)
    for (const fit of tool.fits) {
      lines.push(`- ${fit.taskName} (${fit.score}): ${fit.notes}`)
    }
    lines.push('')
  }
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': LLMS_CACHE_CONTROL },
  })
}

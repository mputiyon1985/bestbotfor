import { getCatalog } from '@/lib/catalog'
import { priceLabel } from '@/lib/format'
import { getSiteUrl, TAGLINE } from '@/lib/site'

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
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

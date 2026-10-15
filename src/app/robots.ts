import type { MetadataRoute } from 'next'
import { isProductionDeployment } from '@/lib/indexing'
import { getSiteUrl } from '@/lib/site'

export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  if (!isProductionDeployment()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }
  const site = getSiteUrl()
  const disallow = ['/go/', '/api/', '/members', '/sign-in', '/sign-up']
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      { userAgent: 'GPTBot', allow: '/', disallow },
      { userAgent: 'ClaudeBot', allow: '/', disallow },
      { userAgent: 'PerplexityBot', allow: '/', disallow },
      { userAgent: 'Google-Extended', allow: '/', disallow },
    ],
    sitemap: new URL('/sitemap.xml', site).toString(),
    host: site,
  }
}

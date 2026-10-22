import type { MetadataRoute } from 'next'
import { isProductionDeployment } from '@/lib/indexing'
import { getSiteUrl } from '@/lib/site'

/**
 * Stays request-time: the rules depend on runtime VERCEL_ENV (preview vs
 * production), and a static build baked the preview disallow-all into CI's
 * Lighthouse run. No DB reads, so this costs no Turso quota.
 */
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  if (!isProductionDeployment()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }
  const site = getSiteUrl()
  const disallow = ['/go/', '/api/', '/members', '/admin', '/sign-in', '/sign-up']
  // Social crawlers (Twitterbot, LinkedInBot) honor robots.txt, so the share
  // images under /api/og must stay fetchable. The longer, more specific Allow
  // wins over `Disallow: /api/`, which still covers every other API route.
  const allow = ['/', '/api/og']
  return {
    rules: [
      { userAgent: '*', allow, disallow },
      { userAgent: 'GPTBot', allow, disallow },
      { userAgent: 'ClaudeBot', allow, disallow },
      { userAgent: 'PerplexityBot', allow, disallow },
      { userAgent: 'Google-Extended', allow, disallow },
    ],
    sitemap: new URL('/sitemap.xml', site).toString(),
    host: site,
  }
}

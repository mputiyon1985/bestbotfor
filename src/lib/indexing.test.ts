import { afterEach, describe, expect, it } from 'vitest'
import { metadata as notFoundMetadata } from '@/app/not-found'
import robots from '@/app/robots'
import { isProductionDeployment, PREVIEW_ROBOTS_TAG } from './indexing'
import { homeDescription, homeTitle, notFoundDescription, notFoundTitle, pageMetadata } from './metadata'
import { getSiteUrl } from './site'

const original = process.env.VERCEL_ENV

afterEach(() => {
  if (original === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = original
})

describe('preview indexing', () => {
  it('indexes only when VERCEL_ENV is production', () => {
    delete process.env.VERCEL_ENV
    expect(isProductionDeployment()).toBe(false)
    process.env.VERCEL_ENV = 'preview'
    expect(isProductionDeployment()).toBe(false)
    process.env.VERCEL_ENV = 'production'
    expect(isProductionDeployment()).toBe(true)
    expect(PREVIEW_ROBOTS_TAG).toBe('noindex, nofollow')
  })

  it('disallows every path outside production and restores the public rules in production', () => {
    process.env.VERCEL_ENV = 'preview'
    const preview = robots()
    expect(preview.rules).toEqual([{ userAgent: '*', disallow: '/' }])
    expect(preview.sitemap).toBeUndefined()

    process.env.VERCEL_ENV = 'production'
    const production = robots()
    const rules = Array.isArray(production.rules) ? production.rules : [production.rules]
    expect(rules.some((rule) => rule.userAgent === '*' && [rule.allow].flat().includes('/'))).toBe(true)
    expect(production.sitemap).toContain('/sitemap.xml')
    expect(JSON.stringify(production.rules)).toContain('"/admin"')
  })

  it('lets every crawler fetch /api/og share images while the rest of /api/ stays disallowed', () => {
    process.env.VERCEL_ENV = 'production'
    const production = robots()
    const rules = Array.isArray(production.rules) ? production.rules : [production.rules]
    expect(rules.map((rule) => rule.userAgent)).toEqual(['*', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'])
    for (const rule of rules) {
      expect([rule.allow].flat(), String(rule.userAgent)).toEqual(['/', '/api/og'])
      expect([rule.disallow].flat(), String(rule.userAgent)).toEqual([
        '/go/',
        '/api/',
        '/members',
        '/admin',
        '/sign-in',
        '/sign-up',
      ])
    }

    process.env.VERCEL_ENV = 'preview'
    expect(JSON.stringify(robots().rules)).not.toContain('/api/og')
  })

  it('puts noindex on page metadata outside production', () => {
    process.env.VERCEL_ENV = 'preview'
    expect(pageMetadata({ title: 'Pricing', description: 'Price', path: '/pricing' }).robots).toEqual({
      index: false,
      follow: false,
    })
    process.env.VERCEL_ENV = 'production'
    expect(pageMetadata({ title: 'Pricing', description: 'Price', path: '/pricing' }).robots).toEqual({
      index: true,
      follow: true,
    })
  })

  it('gives the not-found page its own title and leaves robots to Next’s single noindex tag', () => {
    process.env.VERCEL_ENV = 'production'
    expect(isProductionDeployment()).toBe(true)
    expect(notFoundTitle).toBe('Page not found | BestBotFor')
    expect(notFoundTitle).not.toBe(homeTitle)
    expect(notFoundMetadata.title).toEqual({ absolute: notFoundTitle })
    expect(notFoundMetadata.description).toBe(notFoundDescription)
    expect(notFoundMetadata.description).not.toBe(homeDescription)
    expect(notFoundMetadata.alternates).toEqual({})
    expect(notFoundMetadata.openGraph?.title).toEqual({ absolute: notFoundTitle })
    expect(notFoundMetadata.openGraph?.description).toBe(notFoundDescription)
    expect(notFoundMetadata.twitter?.title).toEqual({ absolute: notFoundTitle })
    expect(notFoundMetadata.twitter?.description).toBe(notFoundDescription)
    // Next.js emits the 404 noindex meta. A second robots field would duplicate it.
    expect(notFoundMetadata.robots).toBeNull()
  })

  it('sets og:url to the absolute canonical', () => {
    const meta = pageMetadata({ title: 'About', description: 'About BestBotFor', path: '/about' })
    const canonical = new URL('/about', getSiteUrl()).toString()
    expect(meta.alternates?.canonical).toBe(canonical)
    expect(meta.openGraph && 'url' in meta.openGraph ? meta.openGraph.url : null).toBe(canonical)
  })

  it('adds the brand to sub-page Open Graph and Twitter titles', () => {
    const meta = pageMetadata({ title: 'About', description: 'About BestBotFor', path: '/about' })
    expect(meta.title).toBe('About')
    expect(meta.openGraph?.title).toBe('About | BestBotFor')
    expect(meta.twitter?.title).toBe('About | BestBotFor')
    const branded = pageMetadata({
      title: 'Page not found | BestBotFor',
      description: 'Missing',
      path: '/missing',
    })
    expect(branded.openGraph?.title).toBe('Page not found | BestBotFor')
  })

  it('can noindex a production page and still follow its links', () => {
    process.env.VERCEL_ENV = 'production'
    expect(pageMetadata({ title: 'Your result', description: 'Pick', path: '/result?task=chat', noIndex: true, follow: true }).robots).toEqual({
      index: false,
      follow: true,
    })
    expect(pageMetadata({ title: 'Search', description: 'Search', path: '/search', noIndex: true }).robots).toEqual({
      index: false,
      follow: false,
    })
    process.env.VERCEL_ENV = 'preview'
    expect(pageMetadata({ title: 'Your result', description: 'Pick', path: '/result?task=chat', noIndex: true, follow: true }).robots).toEqual({
      index: false,
      follow: false,
    })
  })
})

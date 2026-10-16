import { afterEach, describe, expect, it } from 'vitest'
import { metadata as notFoundMetadata } from '@/app/not-found'
import robots from '@/app/robots'
import { isProductionDeployment, PREVIEW_ROBOTS_TAG } from './indexing'
import { homeTitle, notFoundTitle, pageMetadata } from './metadata'

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
    expect(rules.some((rule) => rule.userAgent === '*' && rule.allow === '/')).toBe(true)
    expect(production.sitemap).toContain('/sitemap.xml')
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

  it('gives the not-found page its own title and noindex in production', () => {
    process.env.VERCEL_ENV = 'production'
    expect(isProductionDeployment()).toBe(true)
    expect(notFoundTitle).toBe('Page not found | BestBotFor')
    expect(notFoundTitle).not.toBe(homeTitle)
    expect(notFoundMetadata.title).toEqual({ absolute: notFoundTitle })
    expect(notFoundMetadata.robots).toEqual({ index: false, follow: false })
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

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { POLICY_PAGES_LAWYER_APPROVED, USER_RATINGS_PRODUCTION_LAUNCH } from './review-flags'
import { getSiteUrl } from './site'

const originalVercel = process.env.VERCEL_ENV
const originalDatabase = process.env.TURSO_DATABASE_URL

afterEach(() => {
  if (originalVercel === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = originalVercel
  if (originalDatabase === undefined) delete process.env.TURSO_DATABASE_URL
  else process.env.TURSO_DATABASE_URL = originalDatabase
})

const PUBLIC_POLICIES = ['/privacy', '/terms', '/disclosure'] as const
const RATINGS_DRAFTS = ['/review-guidelines', '/how-user-ratings-work'] as const

describe('public policy indexing', () => {
  it('indexes privacy, terms, and disclosure in production and leaves the ratings drafts noindex', async () => {
    expect(USER_RATINGS_PRODUCTION_LAUNCH).toBe(false)
    expect(POLICY_PAGES_LAWYER_APPROVED).toBe(false)
    process.env.VERCEL_ENV = 'production'
    delete process.env.TURSO_DATABASE_URL

    const pages = {
      '/privacy': await import('@/app/privacy/page'),
      '/terms': await import('@/app/terms/page'),
      '/disclosure': await import('@/app/disclosure/page'),
    }
    for (const route of PUBLIC_POLICIES) {
      expect(pages[route].metadata.robots, route).toEqual({ index: true, follow: true })
      const source = readFileSync(path.join(process.cwd(), `src/app${route}/page.tsx`), 'utf8')
      expect(source, route).toContain('pageMetadata(')
      expect(source, route).not.toContain('policyPageMetadata')
      expect(source, route).not.toContain('noIndex')
    }

    for (const route of RATINGS_DRAFTS) {
      const source = readFileSync(path.join(process.cwd(), `src/app${route}/page.tsx`), 'utf8')
      expect(source, route).toContain('policyPageMetadata(')
    }
  })

  it('keeps the three public policies in the sitemap and out of robots.txt disallow', async () => {
    process.env.VERCEL_ENV = 'production'
    delete process.env.TURSO_DATABASE_URL
    const rules = robots().rules
    const list = Array.isArray(rules) ? rules : [rules]
    const serialized = JSON.stringify(list)
    for (const route of PUBLIC_POLICIES) {
      expect(serialized).not.toContain(`"${route}"`)
      expect(serialized).not.toContain(`"${route}/"`)
    }
    expect(serialized).toContain('"/admin"')

    const entries = await sitemap()
    const urls = entries.map((entry) => entry.url)
    for (const route of PUBLIC_POLICIES) {
      expect(urls).toContain(new URL(route, getSiteUrl()).toString())
    }
    for (const route of RATINGS_DRAFTS) {
      expect(urls.some((url) => url.includes(route))).toBe(false)
    }
  })
})

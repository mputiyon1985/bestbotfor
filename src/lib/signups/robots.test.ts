import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import robots from '@/app/robots'
import { SITEMAP_STATIC_PATHS } from '@/app/sitemap'
import { ROBOTS_HEADER, ROBOTS_METADATA } from '@/lib/signups/privacy'

const originalVercel = process.env.VERCEL_ENV

afterEach(() => {
  if (originalVercel === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = originalVercel
})

describe('robots and noindex', () => {
  it('disallows /admin in production robots.txt', () => {
    process.env.VERCEL_ENV = 'production'
    const result = robots()
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules]
    for (const rule of rules) {
      const disallow = rule.disallow
      const list = Array.isArray(disallow) ? disallow : [disallow]
      expect(list).toContain('/admin')
    }
    expect(ROBOTS_HEADER).toBe('noindex, nofollow')
  })

  it('declares noindex, nofollow metadata', () => {
    expect(ROBOTS_METADATA).toEqual({ index: false, follow: false })
    const layout = readFileSync(path.join(process.cwd(), 'src/app/admin/signups/layout.tsx'), 'utf8')
    expect(layout).toContain('ROBOTS_METADATA')
    expect(layout).toContain('robots:')
  })

  it('leaves the signups admin path out of the sitemap', () => {
    expect(SITEMAP_STATIC_PATHS.some((entry) => entry === '/admin' || entry.startsWith('/admin/'))).toBe(false)
    const source = readFileSync(path.join(process.cwd(), 'src/app/sitemap.ts'), 'utf8')
    expect(source).not.toContain('/admin/signups')
    const header = readFileSync(path.join(process.cwd(), 'src/components/site-header.tsx'), 'utf8')
    const footer = readFileSync(path.join(process.cwd(), 'src/components/site-footer.tsx'), 'utf8')
    expect(header).not.toContain('/admin/signups')
    expect(footer).not.toContain('/admin/signups')
  })
})

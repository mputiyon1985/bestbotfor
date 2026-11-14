import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import robots from '@/app/robots'
import sitemap, { SITEMAP_STATIC_PATHS } from '@/app/sitemap'
import { isAdminPath } from '@/lib/admin-path'

const originalVercel = process.env.VERCEL_ENV

afterEach(() => {
  if (originalVercel === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = originalVercel
})

function files(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...files(full))
    else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) found.push(full)
  }
  return found
}

describe('leads privacy', () => {
  it('disallows /admin, which covers /admin/leads, and sends noindex', () => {
    process.env.VERCEL_ENV = 'production'
    const result = robots()
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules]
    for (const rule of rules) {
      const disallow = [rule.disallow].flat().filter((entry): entry is string => typeof entry === 'string')
      expect(disallow).toContain('/admin')
      expect(disallow.some((entry) => '/admin/leads' === entry || '/admin/leads'.startsWith(entry.endsWith('/') ? entry : `${entry}`))).toBe(true)
      expect('/admin/leads'.startsWith('/admin')).toBe(true)
    }
    const layout = readFileSync(path.join(process.cwd(), 'src/app/admin/leads/layout.tsx'), 'utf8')
    expect(layout).toContain('index: false')
    expect(layout).toContain('follow: false')
    const page = readFileSync(path.join(process.cwd(), 'src/app/admin/leads/page.tsx'), 'utf8')
    expect(page).toContain("dynamic = 'force-dynamic'")
    expect(page).not.toContain("'use client'")
    expect(page).not.toContain('fetch(')
    expect(isAdminPath('/admin/leads')).toBe(true)
    const config = readFileSync(path.join(process.cwd(), 'next.config.ts'), 'utf8')
    expect(config).toContain("source: '/admin/leads'")
    expect(config).toContain("value: 'private, no-store'")
    expect(config).toContain("value: 'noindex, nofollow'")
  })

  it('leaves /admin/leads out of the sitemap and out of public links', async () => {
    expect(SITEMAP_STATIC_PATHS.some((entry) => entry === '/admin' || entry.startsWith('/admin/'))).toBe(false)
    const source = readFileSync(path.join(process.cwd(), 'src/app/sitemap.ts'), 'utf8')
    expect(source).not.toContain('/admin/leads')
    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls.some((url) => url.includes('/admin'))).toBe(false)

    for (const root of ['src/components', 'src/app']) {
      for (const file of files(path.join(process.cwd(), root))) {
        if (file.includes(`${path.sep}admin${path.sep}leads${path.sep}`)) continue
        const text = readFileSync(file, 'utf8')
        expect(text.toLowerCase(), file).not.toContain('/admin/leads')
      }
    }
  })
})

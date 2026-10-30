import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { adminCollapsedRedirect } from './admin-slash'

describe('admin repeated-slash redirect', () => {
  it('sends /admin/ and /admin/signups// to one unslashed admin URL', () => {
    expect(adminCollapsedRedirect('/admin/')).toBe('/admin')
    expect(adminCollapsedRedirect('/admin//')).toBe('/admin')
    expect(adminCollapsedRedirect('/admin/signups//')).toBe('/admin/signups')
    expect(adminCollapsedRedirect('/admin/signups//?from=1')).toBe('/admin/signups?from=1')
    expect(adminCollapsedRedirect('/Admin/Signups//')).toBe('/Admin/Signups')
    expect(adminCollapsedRedirect('/admin//signups')).toBe('/admin/signups')
  })

  it('leaves a public repeated slash for Next', () => {
    expect(adminCollapsedRedirect('/pricing//')).toBeNull()
    expect(adminCollapsedRedirect('/pricing/?plan=annual')).toBeNull()
    expect(adminCollapsedRedirect('/admin/signups')).toBeNull()
  })

  it('refuses an absolute, protocol-relative, or header-breaking target', () => {
    expect(adminCollapsedRedirect('https://evil.example/admin/')).toBeNull()
    expect(adminCollapsedRedirect('//evil.example/admin//')).toBeNull()
    expect(adminCollapsedRedirect('/\\evil.example')).toBeNull()
    expect(adminCollapsedRedirect('/admin/signups//\r\nSet-Cookie: a=b')).toBeNull()
    expect(adminCollapsedRedirect('/admin/<script>//')).toBeNull()
    expect(adminCollapsedRedirect('/admin/signups//?next=https://evil.example')).toBe('/admin/signups')
  })

  it('is the redirect vercel.json sends before Next', () => {
    const vercel = readFileSync('vercel.json', 'utf8')
    const route = JSON.parse(vercel).routes.find((entry: { src?: string }) => entry.src?.includes('/admin(?:/[^/]+)*'))
    expect(route.status).toBe(308)
    expect(route.headers.Location).toBe('$1')
    expect(route.headers['X-Robots-Tag']).toMatch(/noindex/i)
    expect(route.headers['Cache-Control']).toContain('no-store')
    const pattern = new RegExp(route.src, 'i')
    expect('/admin/signups//'.match(pattern)?.[1]).toBe('/admin/signups')
    expect('/admin/'.match(pattern)?.[1]).toBe('/admin')
    expect('/pricing/'.match(pattern)).toBeNull()
  })
})

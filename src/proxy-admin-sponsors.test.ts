import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it } from 'vitest'
import { proxy } from './proxy'

const event = { waitUntil() {} }
const KEYS = ['ADMIN_SPONSORS', 'USER_RATINGS', 'VERCEL_ENV'] as const
const ORIGINAL = Object.fromEntries(KEYS.map((key) => [key, process.env[key]])) as Record<string, string | undefined>

afterEach(() => {
  for (const key of KEYS) {
    const value = ORIGINAL[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

async function get(path: string) {
  const request = new NextRequest(new URL(path, 'http://127.0.0.1:3000'))
  const response = await proxy(request, event as never)
  const body = await response?.text()
  return { status: response?.status, body, type: response?.headers.get('content-type') ?? '', cache: response?.headers.get('cache-control') ?? '', robots: response?.headers.get('x-robots-tag') ?? '' }
}

describe('proxy admin sponsors flag', () => {
  it('404s /admin/sponsors and MFA while the flag is unset, and keeps no-store and noindex', async () => {
    delete process.env.ADMIN_SPONSORS
    delete process.env.USER_RATINGS
    process.env.VERCEL_ENV = 'test'
    for (const path of ['/admin/sponsors', '/Admin/Sponsors', '/admin/%73ponsors', '/admin/mfa-required', '/ADMIN/mfa-required']) {
      const response = await get(path)
      expect(response.status, path).toBe(404)
      expect(response.body, path).toBe('Not found.')
      expect(response.type, path).toContain('text/plain')
      expect(response.cache, path).toContain('no-store')
      expect(response.robots, path).toMatch(/noindex/i)
    }
  })

  it('stays off for invalid values and for production until the launch constant is true', async () => {
    process.env.VERCEL_ENV = 'preview'
    for (const value of ['', 'off', 'ON', 'true', 'yes', '1']) {
      process.env.ADMIN_SPONSORS = value
      const response = await get('/admin/sponsors')
      expect(response.body, value).toBe('Not found.')
    }
    process.env.ADMIN_SPONSORS = 'on'
    process.env.VERCEL_ENV = 'production'
    expect((await get('/admin/sponsors')).body).toBe('Not found.')
    delete process.env.VERCEL_ENV
    expect((await get('/admin/sponsors')).body).toBe('Not found.')
  })

  it('opens the sponsor queue and MFA without opening ratings', async () => {
    process.env.ADMIN_SPONSORS = 'on'
    delete process.env.USER_RATINGS
    process.env.VERCEL_ENV = 'test'
    for (const path of ['/admin/sponsors', '/Admin/Sponsors', '/admin/mfa-required']) {
      const response = await get(path)
      expect(response.body, path).not.toBe('Not found.')
      expect(response.type, path).not.toContain('text/plain')
    }
    for (const path of ['/admin', '/admin/reviews', '/admin/sponsor-links']) {
      const response = await get(path)
      expect(response.status, path).toBe(404)
      expect(response.body, path).toBe('Not found.')
    }
  })

  it('keeps MFA with ratings alone and still hides the sponsor queue', async () => {
    delete process.env.ADMIN_SPONSORS
    process.env.USER_RATINGS = 'on'
    process.env.VERCEL_ENV = 'preview'
    expect((await get('/admin/mfa-required')).body).not.toBe('Not found.')
    expect((await get('/admin/sponsors')).body).toBe('Not found.')
    expect((await get('/admin')).body).not.toBe('Not found.')
  })
})

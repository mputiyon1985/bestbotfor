import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { APPLE_TOUCH_ICON_PATH } from '@/lib/brand'
import { config, proxy } from './proxy'

const event = { waitUntil() {} }

async function get(pathname: string) {
  const response = await proxy(new NextRequest(new URL(pathname, 'https://dash.example')), event as never)
  if (!response) throw new Error(`proxy returned no response for ${pathname}`)
  return response
}

describe('unknown static assets', () => {
  it('keeps image paths on the proxy matcher', () => {
    const matcher = config.matcher.join(' ')
    expect(matcher).not.toMatch(/png|jpe?g|gif|webp|svg|ico|favicon/)
    expect(matcher).toContain('_next/static')
    expect(matcher).toContain('_next/image')
  })

  it('404s an unknown png before the site header can call Clerk', async () => {
    const response = await get('/doesnotexist.png')
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found.')
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-robots-tag')).toMatch(/noindex/i)
    expect(response.headers.get('location')).toBeNull()
  })

  it('serves a real public icon and the precomposed apple touch icon copied from it', async () => {
    const source = readFileSync(path.join(process.cwd(), 'public', APPLE_TOUCH_ICON_PATH))
    const copy = readFileSync(path.join(process.cwd(), 'public/apple-touch-icon-precomposed.png'))
    expect(copy.equals(source)).toBe(true)

    const icon = await get(APPLE_TOUCH_ICON_PATH)
    expect(icon.status).toBe(200)
    expect(icon.headers.get('location')).toBeNull()

    const precomposed = await get('/apple-touch-icon-precomposed.png')
    expect(precomposed.status).toBe(200)
    expect(precomposed.headers.get('location')).toBeNull()
    expect(precomposed.headers.get('x-middleware-rewrite')).toBeNull()
  })
})

import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { proxy } from './proxy'

const event = { waitUntil() {} }

describe('proxy malformed percent-escapes', () => {
  it('returns 400 with no-store and noindex before the path is decoded', async () => {
    for (const path of ['/%E0%A4%A', '/admin/%E0%A4%A']) {
      const request = new NextRequest(new URL(path, 'http://127.0.0.1:3000'))
      const response = await proxy(request, event as never)
      expect(response?.status, path).toBe(400)
      expect(await response?.text(), path).toBe('Bad request.')
      expect(response?.headers.get('cache-control'), path).toContain('no-store')
      expect(response?.headers.get('x-robots-tag'), path).toMatch(/noindex/i)
    }
  })

  it('lets a valid percent-encoding through', async () => {
    for (const path of ['/tools/%63hatgpt', '/%70ricing', '/%E0%A4%A1', '/go/%2e%2e']) {
      const request = new NextRequest(new URL(path, 'http://127.0.0.1:3000'))
      const response = await proxy(request, event as never)
      expect(response?.status, path).not.toBe(400)
      expect(await response?.text(), path).not.toBe('Bad request.')
    }
  })
})

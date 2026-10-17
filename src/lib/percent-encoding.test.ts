import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MALFORMED_PERCENT_ROUTE_SRC,
  edgeRouteMatchesMalformedPercent,
  hasMalformedPercentEncoding,
} from './percent-encoding'

const malformed = [
  '/%E0%A4%A',
  '/admin/%E0%A4%A',
  '/admin/%E0%A4%A/',
  '/%',
  '/%ZZ',
  '/%E0%A4',
  '/%80',
  '/tools/%E0%A4%A',
  'http://127.0.0.1:3000/%E0%A4%A',
  'https://bestbotfor.com/admin/%E0%A4%A?next=1',
]

const valid = [
  '/',
  '/admin',
  '/admin/reviews',
  '/tools/chatgpt',
  '/tools/%63hatgpt',
  '/admin/%41',
  '/admin/%6Dfa-required',
  '/%70ricing',
  '/%E0%A4%A1',
  '/go/%2e%2e',
  '/go/%2E%2E',
  '/tools/%2e%2e',
  '/about/%2e%2e',
  '/%25',
  '/100%20off',
  '/tools/chatgpt?q=%E0%A4%A',
  'https://bestbotfor.com/tools/%63hatgpt',
  'https://bestbotfor.com/pricing?q=%',
]

describe('hasMalformedPercentEncoding', () => {
  it('rejects a truncated or illegal percent-escape, including under /admin', () => {
    for (const path of malformed) expect(hasMalformedPercentEncoding(path), path).toBe(true)
  })

  it('leaves valid encodings and ordinary paths alone', () => {
    for (const path of valid) expect(hasMalformedPercentEncoding(path), path).toBe(false)
  })
})

describe('Vercel malformed percent route', () => {
  it('uses the same pattern as vercel.json', () => {
    const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as {
      routes: { src: string; status: number; headers: Record<string, string> }[]
    }
    const route = config.routes.find((item) => item.src === MALFORMED_PERCENT_ROUTE_SRC)
    expect(route?.status).toBe(400)
    expect(route?.headers['cache-control']).toBe('no-store')
    expect(route?.headers['x-robots-tag']).toContain('noindex')
  })

  it('matches the truncated escapes and not a valid encoding', () => {
    for (const path of ['/%E0%A4%A', '/admin/%E0%A4%A', '/%', '/%ZZ', '/tools/%E0%A4%A']) {
      expect(edgeRouteMatchesMalformedPercent(path), path).toBe(true)
    }
    for (const path of ['/tools/%63hatgpt', '/%70ricing', '/%E0%A4%A1', '/go/%2e%2e', '/admin/%41', '/', '/tools/chatgpt']) {
      expect(edgeRouteMatchesMalformedPercent(path), path).toBe(false)
    }
  })
})

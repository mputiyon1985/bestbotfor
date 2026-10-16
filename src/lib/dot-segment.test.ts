import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DOT_SEGMENT_ROUTE_SRC, edgeRouteMatchesPath, hasDotSegment } from './dot-segment'

const blocked = [
  '/go/%2e%2e',
  '/go/%2E%2E',
  '/go/%2e%2E',
  '/go/%2E%2e',
  '/go/.%2e',
  '/go/.%2E',
  '/go/%2e.',
  '/go/%2E.',
  '/go/%2e%2e/',
  '/go/..',
  '/go/../',
  '/go/foo/../../../',
  '/best/%2e%2e',
  '/tools/%2e%2e',
  '/compare/%2e%2e',
  '/about/%2e%2e',
  '/pricing/%2e%2e',
  '/%2e%2e',
  '/go/%252e%252e',
  '/go/%252E%252E',
  '/go/%2e%2e%2f%2e%2e',
  '/go/%252e%252e%252fsecret',
  'http://127.0.0.1:3000/go/%2e%2e',
  'https://bestbotfor.com/compare/%2E%2E?next=1',
  'https://bestbotfor.com/best/.%2e',
]

const allowed = [
  '/go/chatgpt',
  '/best/coding',
  '/tools/github-copilot',
  '/tools',
  '/tools/',
  '/compare/chatgpt-vs-claude',
  '/about',
  '/pricing',
  '/favicon.ico',
  '/site.webmanifest',
  '/',
  '/search?q=secret',
  '/go/chatgpt?next=https://evil.example',
  '/tools?category=chat-assistant&page=2',
  'https://bestbotfor.com/tools?page=2',
  'https://chatgpt.com/',
]

describe('hasDotSegment', () => {
  it('rejects raw and encoded dot segments on catalog paths and everywhere else', () => {
    for (const path of blocked) expect(hasDotSegment(path), path).toBe(true)
  })

  it('leaves ordinary paths alone, including dots inside a file name', () => {
    for (const path of allowed) expect(hasDotSegment(path), path).toBe(false)
  })

  it('still sees a dot segment after the URL constructor collapses it', () => {
    const raw = 'http://127.0.0.1:3000/go/%2e%2e'
    expect(new URL(raw).pathname).toBe('/')
    expect(hasDotSegment(raw)).toBe(true)
  })
})

describe('Vercel edge route', () => {
  it('uses the same pattern as vercel.json', () => {
    const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as {
      routes: { src: string; status: number }[]
    }
    expect(config.routes).toHaveLength(1)
    expect(config.routes[0]?.src).toBe(DOT_SEGMENT_ROUTE_SRC)
    expect(config.routes[0]?.status).toBe(404)
  })

  it('matches the paths Sentinel saw return the home page, and not real pages', () => {
    for (const path of ['/go/%2e%2e', '/best/%2e%2e', '/compare/%2e%2e', '/tools/%2e%2e', '/about/%2e%2e']) {
      expect(edgeRouteMatchesPath(path), path).toBe(true)
    }
    for (const path of [
      '/go/%2E%2E',
      '/go/.%2e',
      '/go/%2e.',
      '/go/..',
      '/go/foo/../../../',
      '/go/%252e%252e',
      '/go/%2e%2e%2f%2e%2e',
    ]) {
      expect(edgeRouteMatchesPath(path.split('?')[0] ?? path), path).toBe(true)
    }
    for (const path of ['/go/chatgpt', '/best/coding', '/tools', '/tools/', '/compare/chatgpt-vs-claude', '/favicon.ico', '/']) {
      expect(edgeRouteMatchesPath(path), path).toBe(false)
    }
  })
})

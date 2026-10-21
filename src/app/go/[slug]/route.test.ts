import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ limit: 0, tool: 0, db: 0 }))
const faults = vi.hoisted(() => ({ limit: false, tool: false }))
const jobs = vi.hoisted(() => [] as Array<() => Promise<void>>)

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after(work: () => Promise<void>) {
      jobs.push(work)
    },
  }
})

vi.mock('@/lib/db', () => ({
  getDb: () => {
    calls.db += 1
    return { insert: () => ({ values: () => Promise.resolve() }) }
  },
}))

vi.mock('@/lib/rate-limit', () => ({
  consumeRateLimit: () => {
    calls.limit += 1
    if (faults.limit) return Promise.reject(new Error('deadline'))
    return Promise.resolve({ ok: true, remaining: 1, resetAt: 0 })
  },
}))

vi.mock('@/lib/catalog', () => ({
  getTool: () => {
    calls.tool += 1
    if (faults.tool) return Promise.reject(new Error('deadline'))
    return Promise.resolve({
      id: 7,
      url: 'https://cursor.com/download',
      affiliate: { affiliateUrl: 'https://evil.example/aff?ref=1' },
    })
  },
}))

import { GET, HEAD } from './route'

function request(method: string, slug = 'cursor', search = '') {
  return new Request(`https://bestbotfor.com/go/${slug}${search}`, { method })
}

function context(slug = 'cursor') {
  return { params: Promise.resolve({ slug }) }
}

afterEach(() => {
  calls.limit = 0
  calls.tool = 0
  calls.db = 0
  faults.limit = false
  faults.tool = false
  jobs.length = 0
})

describe('HEAD /go/[slug]', () => {
  it('redirects from the reviewed seed and does not count, rate-limit, or log', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    faults.limit = true
    faults.tool = true
    try {
      const head = await HEAD(request('HEAD', 'cursor', '?ref=evil&url=https://evil.example'), context())
      const viaGet = await GET(request('HEAD', 'cursor', '?ref=evil'), context())
      for (const response of [head, viaGet]) {
        expect(response.status).toBe(302)
        expect(response.headers.get('location')).toBe('https://cursor.com/')
        expect(response.headers.get('location')).not.toContain('evil')
        expect(response.headers.get('location')).not.toContain('ref=')
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
      }
      expect(calls).toEqual({ limit: 0, tool: 0, db: 0 })
      expect(jobs).toEqual([])
      expect(error).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
      warn.mockRestore()
    }
  })

  it('keeps the 404 checks without logging', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const missing = await HEAD(request('HEAD', 'not-a-real-tool'), context('not-a-real-tool'))
      const unsafe = await HEAD(request('HEAD', '..'), context('..'))
      expect(missing.status).toBe(404)
      expect(await missing.text()).toBe('That tool is not in the catalog.')
      expect(unsafe.status).toBe(404)
      expect(await unsafe.text()).toBe('That address is not a tool in the catalog.')
      expect(calls).toEqual({ limit: 0, tool: 0, db: 0 })
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })
})

describe('GET /go/[slug]', () => {
  it('still rate-limits, loads the catalog, and records a click', async () => {
    const response = await GET(request('GET', 'cursor', '?ref=evil'), context())
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://cursor.com/download?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct')
    expect(response.headers.get('location')).not.toContain('evil')
    expect(calls.limit).toBe(1)
    expect(calls.tool).toBe(1)
    expect(calls.db).toBe(1)
    expect(jobs).toHaveLength(1)
  })

  it('still logs a rate-limit or catalog deadline at error and answers 302', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    faults.limit = true
    faults.tool = true
    try {
      const response = await GET(request('GET'), context())
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('https://cursor.com/?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct')
      expect(error).toHaveBeenCalledWith('go rate limit failed', 'deadline')
      expect(error).toHaveBeenCalledWith('go catalog failed', 'deadline')
      expect(jobs).toEqual([])
    } finally {
      error.mockRestore()
    }
  })

  it('does not answer a head probe from the click path', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/app/go/[slug]/route.ts'), 'utf8')
    const head = source.slice(source.indexOf('async function headRedirect'), source.indexOf('function redirect'))
    expect(head).toContain('resolveHeadGoRedirect')
    expect(head).not.toContain('consumeRateLimit')
    expect(head).not.toContain('getTool')
    expect(head).not.toContain('getDb')
    expect(head).not.toContain('console.error')
    const get = source.slice(source.indexOf('export async function GET'), source.indexOf('export function HEAD'))
    expect(get).toContain("request.method === 'HEAD'")
    expect(get).toContain('consumeRateLimit')
    expect(get).toContain('getTool')
    expect(get).toContain('db.insert(clicks)')
  })
})

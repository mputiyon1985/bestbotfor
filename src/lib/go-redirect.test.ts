import { createHash, createHmac, hkdfSync } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { resolveGoRedirect, resolveHeadGoRedirect, type GoToolRecord } from './go-redirect'

const cursor = {
  headers: new Headers(),
  ip: '203.0.113.5',
  siteUrl: 'https://bestbotfor.com',
  seedUrl: 'https://cursor.com',
  allowedHosts: ['cursor.com'],
}

function tool(url = 'https://cursor.com'): GoToolRecord {
  return { id: 7, url, affiliateUrl: 'https://evil.example/aff' }
}

describe('resolveHeadGoRedirect', () => {
  it('redirects to the reviewed seed URL and does not log', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(resolveHeadGoRedirect('cursor')).toEqual({
        status: 302,
        location: 'https://cursor.com/',
        click: null,
      })
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })

  it('keeps the same 404 checks and ignores a query-shaped slug', () => {
    expect(resolveHeadGoRedirect('not-a-real-tool')).toEqual({
      status: 404,
      body: 'That tool is not in the catalog.',
    })
    expect(resolveHeadGoRedirect('..')).toEqual({
      status: 404,
      body: 'That address is not a tool in the catalog.',
    })
    expect(resolveHeadGoRedirect('cursor?ref=1').status).toBe(404)
  })
})

describe('resolveGoRedirect', () => {
  it('redirects to the reviewed host and does not wait on the click write', async () => {
    let clicks = 0
    const outcome = await resolveGoRedirect({
      ...cursor,
      limit: async () => ({ ok: true }),
      loadTool: async () => {
        clicks += 1
        return tool()
      },
    })
    expect(outcome).toMatchObject({ status: 302, location: 'https://cursor.com/?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct', click: { toolId: 7 } })
    expect(clicks).toBe(1)
    if (outcome.status === 302) expect(outcome.click?.page).toBe('direct')
  })

  it('fails open when the rate limit throws or never returns, and does not answer 503', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const thrown = await resolveGoRedirect({
      ...cursor,
      deadlineMs: 50,
      limit: async () => {
        throw new Error('database unavailable')
      },
      loadTool: async () => tool(),
    })
    expect(thrown.status).toBe(302)
    expect(thrown.status).not.toBe(503)

    const started = Date.now()
    const hung = await resolveGoRedirect({
      ...cursor,
      deadlineMs: 40,
      limit: () => new Promise(() => {}),
      loadTool: () => new Promise(() => {}),
    })
    expect(Date.now() - started).toBeLessThan(400)
    expect(hung).toEqual({ status: 302, location: 'https://cursor.com/?utm_source=bestbotfor&utm_medium=referral&utm_campaign=direct', click: null })
    expect(error).toHaveBeenCalledWith('go rate limit failed', 'deadline')
    expect(error).toHaveBeenCalledWith('go catalog failed', 'deadline')
    error.mockRestore()
  })

  it('still refuses a network that is over the limit', async () => {
    const outcome = await resolveGoRedirect({
      ...cursor,
      limit: async () => ({ ok: false }),
      loadTool: async () => tool(),
    })
    expect(outcome.status).toBe(429)
  })

  it('rejects a database URL whose host is not on the reviewed list', async () => {
    const outcome = await resolveGoRedirect({
      ...cursor,
      limit: async () => ({ ok: true }),
      loadTool: async () => tool('https://evil.example/phish'),
    })
    expect(outcome).toEqual({ status: 404, body: 'That tool is not in the catalog.' })
  })

  it('hashes the click IP with HMAC under the rate-limit secret', async () => {
    const previous = process.env.RATE_LIMIT_HMAC_SECRET
    const salt = process.env.IP_HASH_SALT
    process.env.RATE_LIMIT_HMAC_SECRET = 'dedicated-secret'
    process.env.IP_HASH_SALT = 'legacy-click-salt-value'
    try {
      const outcome = await resolveGoRedirect({
        ...cursor,
        limit: async () => ({ ok: true }),
        loadTool: async () => tool(),
      })
      expect(outcome.status).toBe(302)
      if (outcome.status !== 302) return
      const ip = '203.0.113.5'
      const clickKey = Buffer.from(hkdfSync('sha256', 'dedicated-secret', 'bestbotfor/rate-limit-hkdf-salt/v1', 'bestbotfor/click-ip/v1', 32))
      expect(outcome.click?.ipHash).toBe(createHmac('sha256', clickKey).update(ip).digest('hex'))
      expect(outcome.click?.ipHash).not.toBe(createHmac('sha256', 'dedicated-secret').update(`bestbotfor-click|${ip}`).digest('hex'))
      expect(outcome.click?.ipHash).not.toBe(createHash('sha256').update(`legacy-click-salt-value|${ip}`).digest('hex'))
    } finally {
      if (previous === undefined) delete process.env.RATE_LIMIT_HMAC_SECRET
      else process.env.RATE_LIMIT_HMAC_SECRET = previous
      if (salt === undefined) delete process.env.IP_HASH_SALT
      else process.env.IP_HASH_SALT = salt
    }
  })

  it('does not record a click for a prefetch', async () => {
    const outcome = await resolveGoRedirect({
      ...cursor,
      headers: new Headers({ purpose: 'prefetch' }),
      limit: async () => ({ ok: true }),
      loadTool: async () => tool(),
    })
    expect(outcome).toMatchObject({ status: 302, click: null })
  })
})

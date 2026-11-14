import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it } from 'vitest'
import { proxy } from '@/proxy'
import { decideLeadsGate, leadsRequestAuthorized, leadsRequestProof } from '@/lib/leads/paths'

const event = { waitUntil() {} }
const PASSWORD = 'test-leads-password-value'
const SECRET = 'test-leads-session-secret-32chars-ok'

async function get(path: string) {
  const response = await proxy(new NextRequest(new URL(path, 'https://dash.example')), event as never)
  const body = await response?.text()
  return {
    status: response?.status,
    body,
    cache: response?.headers.get('cache-control') ?? '',
    robots: response?.headers.get('x-robots-tag') ?? '',
    location: response?.headers.get('location') ?? '',
  }
}

afterEach(() => {
  delete process.env.BBF_LEADS_PASSWORD
  delete process.env.BBF_LEADS_SESSION_SECRET
  delete process.env.ADMIN_SPONSORS
  delete process.env.USER_RATINGS
  delete process.env.VERCEL_ENV
})

describe('leads proxy gate', () => {
  it('fails closed when the password is unset and does not open sponsors', async () => {
    delete process.env.BBF_LEADS_PASSWORD
    delete process.env.ADMIN_SPONSORS
    process.env.VERCEL_ENV = 'test'
    for (const path of ['/admin/leads', '/admin/leads/', '/Admin/Leads', '/admin/%6Ceads']) {
      const response = await get(path)
      expect(response.status, path).toBe(404)
      expect(response.body, path).toBe('Not found.')
      expect(response.cache, path).toContain('no-store')
      expect(response.robots, path).toMatch(/noindex/i)
    }
    expect(decideLeadsGate('/admin/sponsors')).toBe('skip')
    expect(decideLeadsGate('/admin/leadsomething')).toBe('skip')
    expect((await get('/admin/sponsors')).body).toBe('Not found.')
    process.env.BBF_LEADS_PASSWORD = PASSWORD
    delete process.env.BBF_LEADS_SESSION_SECRET
    expect((await get('/admin/leads')).status).toBe(404)
  })

  it('opens the leads page when the password is set and keeps it uncached', async () => {
    process.env.BBF_LEADS_PASSWORD = PASSWORD
    process.env.BBF_LEADS_SESSION_SECRET = SECRET
    delete process.env.ADMIN_SPONSORS
    process.env.VERCEL_ENV = 'test'
    const response = await get('/admin/leads')
    expect(response.status).toBe(200)
    expect(response.body).not.toBe('Not found.')
    expect(response.cache).toContain('no-store')
    expect(response.robots).toBe('noindex, nofollow')
    expect((await get('/admin/sponsors')).body).toBe('Not found.')
    const slashed = await get('/admin/leads/')
    expect(slashed.status).toBe(308)
    expect(slashed.location).toBe('https://dash.example/admin/leads')
    expect(slashed.cache).toContain('no-store')
    expect(slashed.robots).toMatch(/noindex/i)
    expect(leadsRequestAuthorized('/admin/leads', '1', SECRET)).toBe(false)
    expect(leadsRequestAuthorized('/admin/sponsors', leadsRequestProof('/admin/leads', SECRET), SECRET)).toBe(false)
    expect(leadsRequestAuthorized('/admin/leads', leadsRequestProof('/admin/leads', SECRET), SECRET)).toBe(true)
    const spoofed = await proxy(
      new NextRequest('https://dash.example/admin/sponsors', { headers: { 'x-bbf-leads': '1', 'x-bbf-leads-path': '/admin/leads' } }),
      event as never,
    )
    expect(await spoofed?.text()).toBe('Not found.')
  })
})

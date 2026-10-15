import { request as httpRequest } from 'node:http'
import { expect, test } from '@playwright/test'

function rawStatus(path: string): Promise<{ status: number; body: string }> {
  const base = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000')
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: base.hostname, port: base.port, path, method: 'GET' },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

test('the home page sends a nonce content security policy', async ({ request }) => {
  const response = await request.get('/')
  expect(response.status()).toBe(200)
  const policy = response.headers()['content-security-policy'] ?? ''
  expect(policy).toContain("default-src 'self'")
  expect(policy).toContain('nonce-')
  expect(policy).toContain("object-src 'none'")
})

test('encoded dot segments under /go do not render the home page', async () => {
  for (const path of ['/go/%2e%2e', '/go/%2E%2E', '/go/..', '/go/%2e%2e/', '/go/%252e%252e', '/go/foo/../../../']) {
    const response = await rawStatus(path)
    expect(response.status, path).toBe(404)
    expect(response.body, path).toContain('not a tool in the catalog')
    expect(response.body, path).not.toContain('Three questions')
  }
})

test('best and tools reject a slug that is not in the catalog shape', async () => {
  for (const path of ['/best/%2e%2e', '/tools/%2e%2e', '/best/Not_A_Task']) {
    const response = await rawStatus(path)
    expect(response.status, path).toBe(404)
  }
})

test('a compare image uses the pair and is cacheable', async ({ request }) => {
  const response = await request.get('/api/og?kind=compare&pair=chatgpt-vs-claude')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('image/png')
  expect(response.headers()['content-type']).not.toContain('text/html')
  const cache = response.headers()['cache-control'] ?? ''
  expect(cache).toContain('s-maxage=86400')
  expect(cache).toContain('stale-while-revalidate=604800')
})

test('invalid preview params redirect to one canonical url', async ({ request }) => {
  const response = await request.get('/api/og?title=%3Cscript%3E&kind=nope', { maxRedirects: 0 })
  expect(response.status()).toBe(308)
  expect(response.headers().location).toBe('/api/og')
  expect(response.headers()['cache-control'] ?? '').toContain('s-maxage=86400')

  const reordered = await request.get('/api/og?pair=chatgpt-vs-claude&kind=compare', { maxRedirects: 0 })
  expect(reordered.status()).toBe(308)
  expect(reordered.headers().location).toBe('/api/og?kind=compare&pair=chatgpt-vs-claude')
})

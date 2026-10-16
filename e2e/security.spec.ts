import { request as httpRequest } from 'node:http'
import { expect, test } from '@playwright/test'
import { homeTitle, notFoundTitle } from '../src/lib/metadata'
import { toolCategories } from '../src/lib/tool-index'
import { catalogFromSeeds } from '../src/test/catalog-from-seeds'

function documentTitle(html: string): string {
  return html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
}

function robotsDirectives(html: string): string[] {
  return [...html.matchAll(/<meta\b[^>]*>/gi)]
    .filter((match) => /name=["']robots["']/i.test(match[0]))
    .map((match) => match[0].match(/content=["']([^"']*)["']/i)?.[1] ?? '')
}

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

const HOME_MARKER = 'The right AI in 30 seconds'

test('encoded dot segments do not render the home page', async () => {
  const home = await rawStatus('/')
  expect(home.status).toBe(200)
  expect(home.body).toContain(HOME_MARKER)
  // The same assertion used on 404s must fail when the body is the home page.
  expect(() => {
    expect(home.body).not.toContain(HOME_MARKER)
  }).toThrow()

  for (const path of [
    '/go/%2e%2e',
    '/go/%2E%2E',
    '/go/..',
    '/go/%2e%2e/',
    '/go/%252e%252e',
    '/go/foo/../../../',
    '/go/.%2e',
    '/go/%2e.',
    '/best/%2e%2e',
    '/tools/%2e%2e',
    '/compare/%2e%2e',
    '/about/%2e%2e',
    '/pricing/%2E%2E',
  ]) {
    const response = await rawStatus(path)
    expect(response.status, path).toBe(404)
    expect(response.body, path).toContain('not a tool in the catalog')
    expect(response.body, path).not.toContain(HOME_MARKER)
    expect(documentTitle(response.body), path).not.toBe(homeTitle)
    expect(response.body, path).not.toContain(notFoundTitle)
  }
})

test('a missing page is the not-found screen, not the home page', async () => {
  const home = await rawStatus('/')
  expect(home.status).toBe(200)
  expect(documentTitle(home.body)).toBe(homeTitle)
  expect(home.body).not.toContain(notFoundTitle)
  // The footer repeats the tagline on both pages, so the document title is what separates them.
  expect(home.body).toContain(HOME_MARKER)
  expect(() => {
    expect(documentTitle(home.body)).toBe(notFoundTitle)
  }).toThrow()
  expect(() => {
    expect(documentTitle(home.body)).not.toBe(homeTitle)
  }).toThrow()

  const missing = await rawStatus('/this-page-does-not-exist')
  expect(missing.status).toBe(404)
  expect(documentTitle(missing.body)).toBe(notFoundTitle)
  expect(documentTitle(missing.body)).not.toBe(homeTitle)
  expect(missing.body).toContain('That page is not in the catalog.')
  expect(missing.body).toContain(HOME_MARKER)
  const robots = robotsDirectives(missing.body)
  expect(robots.length).toBeGreaterThan(0)
  expect(robots.every((content) => content.includes('noindex'))).toBe(true)
  expect(robots).toContain('noindex, nofollow')
})

test('the tools index is served and still rejects an unsafe slug', async () => {
  const catalog = catalogFromSeeds()
  const category = toolCategories(catalog.tools)[0]
  expect(category).toBeTruthy()
  if (!category) return

  const index = await rawStatus('/tools')
  expect(index.status).toBe(200)
  expect(index.body).toContain('Tools')
  expect(index.body).toContain(`${catalog.tools.length} tools. Page 1 of`)
  expect(index.body).not.toContain('not a tool in the catalog')

  const filtered = await rawStatus(`/tools?category=${category.slug}`)
  expect(filtered.status).toBe(200)
  expect(filtered.body).toContain(`${category.count} ${category.name} tools. Page 1 of`)

  const unsafe = await rawStatus('/tools/%2e%2e')
  expect(unsafe.status).toBe(404)
  expect(unsafe.body).toContain('not a tool in the catalog')
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

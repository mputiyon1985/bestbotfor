import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadAllSources } from '@/lib/signups/sources/load'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.BEEHIIV_API_KEY
  delete process.env.BEEHIIV_PUBLICATION_ID
})

describe('signups source cache', () => {
  it('does not put subscriber emails in the Next.js data cache', () => {
    const load = readFileSync(path.join(process.cwd(), 'src/lib/signups/sources/load.ts'), 'utf8')
    const sources = readFileSync(path.join(process.cwd(), 'src/lib/signups/sources/beehiiv.ts'), 'utf8')
    expect(load).not.toContain('unstable_cache')
    expect(load).not.toContain('revalidate')
    expect(sources).not.toContain('unstable_cache')
    expect(load).toContain('this request only')
  })

  it('loads a source again on the next call', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv_test_key'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_123'
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ email: 'b@example.com', created: 1767225600 }], total_results: 1, total_pages: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const first = await loadAllSources()
    const second = await loadAllSources()
    expect(first[1]?.signups).toEqual(second[1]?.signups)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

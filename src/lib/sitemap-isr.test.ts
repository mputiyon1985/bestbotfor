import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/catalog', () => ({
  listPublicSlugs: vi.fn(async () => {
    throw new Error('turso blocked')
  }),
  listTaskCandidates: vi.fn(),
}))
vi.mock('@/lib/sitemap-dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sitemap-dates')>()
  return { ...actual, readSitemapDates: vi.fn(async () => actual.emptySitemapDates()) }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('sitemap ISR on catalog failure', () => {
  it('keeps the degraded sitemap outside a production server', async () => {
    const { sitemapDegradedAllowed } = await import('@/app/sitemap')
    expect(sitemapDegradedAllowed({ NODE_ENV: 'production' })).toBe(false)
    expect(sitemapDegradedAllowed({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' })).toBe(true)
    expect(sitemapDegradedAllowed({ NODE_ENV: 'test' })).toBe(true)
    expect(sitemapDegradedAllowed({ NODE_ENV: 'development' })).toBe(true)
  })

  it('throws at revalidation time so Next keeps the last good sitemap', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PHASE', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { default: sitemap } = await import('@/app/sitemap')
    await expect(sitemap()).rejects.toMatchObject({ name: 'SitemapCatalogUnavailableError' })
  })

  it('still returns the degraded static sitemap during next build', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PHASE', 'phase-production-build')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { default: sitemap, SITEMAP_STATIC_PATHS } = await import('@/app/sitemap')
    const entries = await sitemap()
    expect(entries.length).toBeGreaterThanOrEqual(SITEMAP_STATIC_PATHS.length)
    expect(entries.some((entry) => entry.url.includes('/tools/'))).toBe(false)
  })
})

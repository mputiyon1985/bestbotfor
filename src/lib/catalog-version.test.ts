import { afterEach, describe, expect, it, vi } from 'vitest'
import { catalogCacheKey, catalogCacheVersion } from './catalog-version'

describe('catalogCacheVersion', () => {
  it('uses the Vercel commit SHA', () => {
    expect(catalogCacheVersion({ VERCEL_GIT_COMMIT_SHA: 'C056456ABCDEF0123456789' })).toBe('sha-c056456abcde')
  })
  it('falls back to the deployment id, then a safe local value', () => {
    expect(catalogCacheVersion({ VERCEL_DEPLOYMENT_ID: 'dpl_123abc' })).toBe('dpl-dpl_123abc')
    expect(catalogCacheVersion({})).toBe('local')
    expect(catalogCacheVersion({ VERCEL_GIT_COMMIT_SHA: 'not a sha!' })).toBe('local')
  })
  it('differs per deploy', () => {
    expect(catalogCacheKey('tool-by-slug-v1', { VERCEL_GIT_COMMIT_SHA: 'aaaaaaa1' })).not.toEqual(
      catalogCacheKey('tool-by-slug-v1', { VERCEL_GIT_COMMIT_SHA: 'bbbbbbb2' }),
    )
  })
})

const captured = vi.hoisted(() => [] as string[][])
vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown, keyParts: string[]) => {
    captured.push(keyParts)
    return fn
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('every catalog unstable_cache key carries the deploy version', () => {
  it('includes the commit SHA in all keys', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'deadbeefcafe1234')
    vi.stubEnv('VITEST', 'false') // exercise the real cache wrapper path
    vi.resetModules()
    captured.length = 0
    await import('./catalog')
    expect(captured.length).toBeGreaterThanOrEqual(12)
    for (const parts of captured) expect(parts).toContain('catalog-version:sha-deadbeefcafe')
    expect(captured.some((parts) => parts[0] === 'visible-tool-count-v1')).toBe(true)
  })
})

describe('warnIfLocalCatalogVersionInProduction', () => {
  it('warns once in production when the version is local', async () => {
    const { warnIfLocalCatalogVersionInProduction, resetCatalogVersionWarningForTests } = await vi.importActual<typeof import('./catalog-version')>('./catalog-version')
    resetCatalogVersionWarningForTests()
    const warn = vi.fn()
    expect(warnIfLocalCatalogVersionInProduction({ VERCEL_ENV: 'production' }, warn)).toBe(true)
    expect(warnIfLocalCatalogVersionInProduction({ VERCEL_ENV: 'production' }, warn)).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).not.toMatch(/[0-9a-f]{12}/)
  })
  it('stays quiet outside production or with a real version', async () => {
    const { warnIfLocalCatalogVersionInProduction, resetCatalogVersionWarningForTests } = await vi.importActual<typeof import('./catalog-version')>('./catalog-version')
    resetCatalogVersionWarningForTests()
    const warn = vi.fn()
    expect(warnIfLocalCatalogVersionInProduction({ VERCEL_ENV: 'preview' }, warn)).toBe(false)
    expect(warnIfLocalCatalogVersionInProduction({}, warn)).toBe(false)
    expect(warnIfLocalCatalogVersionInProduction({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_SHA: 'abcdef1234567' }, warn)).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })
})

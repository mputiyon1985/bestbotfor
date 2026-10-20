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
    expect(captured.length).toBe(11)
    for (const parts of captured) expect(parts).toContain('catalog-version:sha-deadbeefcafe')
  })
})

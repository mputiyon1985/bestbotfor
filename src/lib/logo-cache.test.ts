import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'
import { HASHED_ASSET_CACHE_CONTROL } from './brand'

describe('logo cache headers', () => {
  it('marks /logos as public, immutable, and cached for a year', async () => {
    expect(nextConfig.headers).toBeTypeOf('function')
    const rules = await nextConfig.headers!()
    const logos = rules.find((rule) => rule.source === '/logos/:path*')
    expect(logos?.headers).toEqual([{ key: 'Cache-Control', value: HASHED_ASSET_CACHE_CONTROL }])
    expect(HASHED_ASSET_CACHE_CONTROL).toBe('public, max-age=31536000, immutable')
  })
})

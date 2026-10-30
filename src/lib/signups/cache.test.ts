import { afterEach, describe, expect, it, vi } from 'vitest'
import { cached, REVALIDATE_SECONDS, resetCacheForTests } from '@/lib/signups/cache'

const nextCache = vi.hoisted(() => ({
  unstable_cache: vi.fn((fn: () => Promise<unknown>) => fn),
}))

vi.mock('next/cache', () => nextCache)

afterEach(() => {
  resetCacheForTests()
  vi.useRealTimers()
})

describe('cache wrapper', () => {
  it('registers unstable_cache with a 300 second revalidate', () => {
    const load = async () => 'ok'
    cached('signups-example', load)
    expect(REVALIDATE_SECONDS).toBe(300)
    expect(nextCache.unstable_cache).toHaveBeenCalledWith(load, ['signups-example'], { revalidate: 300 })
  })

  it('does not call the loader again within 300 seconds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    let calls = 0
    const load = cached('signups-ttl', async () => {
      calls += 1
      return calls
    })
    expect(await load()).toBe(1)
    expect(await load()).toBe(1)
    vi.setSystemTime(new Date('2026-01-01T00:04:59.000Z'))
    expect(await load()).toBe(1)
    expect(calls).toBe(1)
    vi.setSystemTime(new Date('2026-01-01T00:05:00.000Z'))
    expect(await load()).toBe(2)
    expect(calls).toBe(2)
  })
})

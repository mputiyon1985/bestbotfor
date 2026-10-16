import { describe, expect, it, vi } from 'vitest'
import { allowRate } from './action-limit'
import type { Database } from './db/client'

function brokenLimiter(): Database {
  return {
    $client: {
      execute: async () => {
        throw new Error('limiter down')
      },
    },
  } as unknown as Database
}

describe('allowRate', () => {
  it('fails closed when sponsor checkout asks it to', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(allowRate(brokenLimiter(), 'sponsor', 8, 60_000, { failClosed: true })).resolves.toBe(false)
    expect(error).toHaveBeenCalledWith('rate limit failed', 'Error')
    error.mockRestore()
  })

  it('stays open for other actions when the limiter throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(allowRate(brokenLimiter(), 'result', 30, 60_000)).resolves.toBe(true)
    error.mockRestore()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowRate } from './action-limit'
import type { Database } from './db/client'
import { createTestDatabase } from '@/test/db'

afterEach(() => {
  vi.restoreAllMocks()
})

function dbThat(execute: () => Promise<unknown>): Database {
  return { $client: { execute } } as unknown as Database
}

describe('allowRate', () => {
  it('returns the limiter decision when the write succeeds', async () => {
    const { db, close } = await createTestDatabase()
    const allowed = await allowRate(db, 'checkout-ok', 1, 60_000, { onError: 'closed', now: 1_000 })
    const blocked = await allowRate(db, 'checkout-ok', 1, 60_000, { onError: 'closed', now: 1_000 })
    expect(allowed).toBe(true)
    expect(blocked).toBe(false)
    const stillBlocked = await allowRate(db, 'checkout-ok', 1, 60_000, { onError: 'open', now: 1_000 })
    expect(stillBlocked).toBe(false)
    await close()
  })

  it('fails closed for a write when the limiter throws or never returns', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const thrown = dbThat(() => Promise.reject(new Error('store down')))
    const hung = dbThat(() => new Promise(() => undefined))
    await expect(allowRate(thrown, 'checkout-throw', 8, 60_000, { onError: 'closed' })).resolves.toBe(false)
    await expect(allowRate(hung, 'checkout-hang', 8, 60_000, { onError: 'closed' })).resolves.toBe(false)
  })

  it('fails open for a read when the limiter throws or never returns', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const thrown = dbThat(() => Promise.reject(new Error('store down')))
    const hung = dbThat(() => new Promise(() => undefined))
    await expect(allowRate(thrown, 'result-throw', 30, 60_000, { onError: 'open' })).resolves.toBe(true)
    await expect(allowRate(hung, 'result-hang', 30, 60_000, { onError: 'open' })).resolves.toBe(true)
  })
})

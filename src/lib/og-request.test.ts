import { describe, expect, it } from 'vitest'
import { consumeRateLimit } from './rate-limit'
import { gateOgRequest } from './og-request'
import { OG_RATE_LIMIT, OG_RATE_WINDOW_MS } from './og'
import { createTestDatabase } from '@/test/db'

describe('gateOgRequest', () => {
  it('allows the burst and then limits', async () => {
    const { db, close } = await createTestDatabase()
    const results = await Promise.all(
      Array.from({ length: OG_RATE_LIMIT + 2 }, () =>
        gateOgRequest(consumeRateLimit(db, 'og-test', OG_RATE_LIMIT, OG_RATE_WINDOW_MS, 1_000), 800),
      ),
    )
    expect(results.filter((result) => result === 'allow')).toHaveLength(OG_RATE_LIMIT)
    expect(results.filter((result) => result === 'limit')).toHaveLength(2)
    await close()
  })

  it('fails open when the limiter does not answer', async () => {
    const result = await gateOgRequest(new Promise(() => {}), 30)
    expect(result).toBe('allow')
  })

  it('fails open when the limiter throws', async () => {
    const result = await gateOgRequest(Promise.reject(new Error('db down')), 800)
    expect(result).toBe('allow')
  })
})
import { afterEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/test/db'
import { checkoutRecoverySuppressions } from './db/schema'
import {
  checkoutRecoveryUnsubscribeEmail,
  checkoutRecoveryUnsubscribeToken,
  readUnsubscribe,
  recordUnsubscribe,
} from './checkout-recovery-unsubscribe'

const SECRET = 'u'.repeat(32)

describe('checkout recovery unsubscribe', () => {
  const previous = process.env.CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET
  afterEach(() => {
    if (previous === undefined) delete process.env.CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET
    else process.env.CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET = previous
  })

  it('signs a token and rejects a tampered one or a short secret', () => {
    const token = checkoutRecoveryUnsubscribeToken(SECRET, 'Buyer@Example.com')
    expect(token).toBeTruthy()
    expect(checkoutRecoveryUnsubscribeEmail(SECRET, token ?? '')).toBe('buyer@example.com')
    expect(checkoutRecoveryUnsubscribeEmail('v'.repeat(32), token ?? '')).toBeNull()
    expect(checkoutRecoveryUnsubscribeEmail(SECRET, `${token}x`)).toBeNull()
    expect(checkoutRecoveryUnsubscribeToken('short', 'buyer@example.com')).toBeNull()
  })

  it('GET shows a confirmation and does not suppress; POST one-click and the form do', async () => {
    process.env.CHECKOUT_RECOVERY_UNSUBSCRIBE_SECRET = SECRET
    const { db, close } = await createTestDatabase()
    const token = checkoutRecoveryUnsubscribeToken(SECRET, 'Buyer@Example.com') ?? ''
    const viewed = readUnsubscribe(process.env, token)
    expect(viewed.status).toBe(200)
    expect(viewed.html).toContain('Unsubscribe')
    expect(viewed.html).toContain('privacy@bestbotfor.com')
    expect(viewed.html).toContain('method="post"')
    expect(await db.select().from(checkoutRecoverySuppressions)).toEqual([])

    const oneClick = await recordUnsubscribe(db, process.env, token, 'List-Unsubscribe=One-Click', 20)
    expect(oneClick.status).toBe(200)
    const rows = await db.select().from(checkoutRecoverySuppressions)
    expect(rows).toEqual([{ email: 'buyer@example.com', suppressedAt: 20, source: 'one_click' }])

    const again = await recordUnsubscribe(db, process.env, token, '', 30)
    expect(again.status).toBe(200)
    const kept = await db.select().from(checkoutRecoverySuppressions)
    expect(kept).toHaveLength(1)
    expect(kept[0]?.suppressedAt).toBe(20)
    expect(kept[0]?.source).toBe('one_click')

    expect((await recordUnsubscribe(db, process.env, 'nope', 'List-Unsubscribe=One-Click', 40)).status).toBe(400)
    expect(readUnsubscribe(process.env, 'nope').status).toBe(400)
    await close()
  })
})

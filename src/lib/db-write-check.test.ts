import { describe, expect, it } from 'vitest'
import { isWrite } from '../../scripts/check-db-writes'

describe('database write check', () => {
  it('flags a chained write whose first argument starts with $', () => {
    expect(isWrite('.update($set)')).toBe(true)
    expect(isWrite('.insert($values)')).toBe(true)
    expect(isWrite('.delete($rows)')).toBe(true)
    expect(isWrite('  .update( $set)')).toBe(true)
    expect(isWrite('.insert($values.foo)')).toBe(true)
  })

  it('still flags an identifier argument and a bare call', () => {
    expect(isWrite('.update(tasks)')).toBe(true)
    expect(isWrite('.insert(')).toBe(true)
    expect(isWrite('  .delete(rows)')).toBe(true)
  })

  it('leaves HMAC template updates and non-sql lines alone', () => {
    const ratePayload = '.update(`' + "bestbotfor-rate|${action}|${ip ?? 'unknown'}`)"
    const clickPayload = '.update(`' + 'bestbotfor-click|${ip}`)'
    expect(isWrite(ratePayload)).toBe(false)
    expect(isWrite(clickPayload)).toBe(false)
    expect(isWrite("  return createHmac('sha256', rateLimitHmacSecret()).update(payload).digest('hex')")).toBe(false)
    expect(isWrite('.update({ slug })')).toBe(false)
  })
})

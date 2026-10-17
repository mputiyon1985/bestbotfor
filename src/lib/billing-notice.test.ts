import { describe, expect, it } from 'vitest'
import { billingNoticeQuery, checkoutNoticeMessage, portalNoticeMessage } from './billing-notice'

describe('membership rate-limit notices', () => {
  it('gives checkout a full window and a limiter outage different sentences', () => {
    expect(billingNoticeQuery('limit')).toBe('rate')
    expect(billingNoticeQuery('unavailable')).toBe('unavailable')
    const limited = checkoutNoticeMessage('rate')
    const outage = checkoutNoticeMessage('unavailable')
    expect(limited).toBe('Too many checkout attempts from this account. Try again in an hour.')
    expect(outage).toBe('Checkout is temporarily unavailable. Try again.')
    expect(limited).not.toBe(outage)
    expect(outage).not.toContain('Too many')
    expect(limited).not.toContain('temporarily unavailable')
    expect(checkoutNoticeMessage('other')).toBeNull()
    expect(checkoutNoticeMessage('')).toBeNull()
  })

  it('gives the billing portal a full window and a limiter outage different sentences', () => {
    const limited = portalNoticeMessage(billingNoticeQuery('limit'))
    const outage = portalNoticeMessage(billingNoticeQuery('unavailable'))
    expect(limited).toBe('Too many billing portal attempts. Try again in an hour.')
    expect(outage).toBe('The billing portal is temporarily unavailable. Try again.')
    expect(limited).not.toBe(outage)
    expect(outage).not.toContain('Too many')
    expect(limited).not.toContain('temporarily unavailable')
    expect(portalNoticeMessage('rate')).not.toBe(checkoutNoticeMessage('rate'))
    expect(portalNoticeMessage('nope')).toBeNull()
  })
})

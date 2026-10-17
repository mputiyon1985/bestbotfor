import { describe, expect, it } from 'vitest'
import { REASON_CODES, isReasonCode, reasonLabel } from './reasons'

describe('reason codes', () => {
  it('gives every code a sentiment-neutral label', () => {
    for (const code of REASON_CODES) {
      const label = reasonLabel(code)
      expect(label.length).toBeGreaterThan(0)
      expect(label.toLowerCase()).not.toMatch(/negative|low rating|unfair/)
      expect(isReasonCode(code)).toBe(true)
    }
    expect(isReasonCode('negative')).toBe(false)
    expect(isReasonCode('low_rating')).toBe(false)
  })
})

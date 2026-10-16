import { describe, expect, it } from 'vitest'
import { isPageInRange, parsePageNumber } from './page-number'

describe('parsePageNumber', () => {
  it('treats a missing page as the first page', () => {
    expect(parsePageNumber('')).toBe(1)
  })

  it('accepts canonical page numbers', () => {
    expect(parsePageNumber('1')).toBe(1)
    expect(parsePageNumber('2')).toBe(2)
    expect(parsePageNumber('8')).toBe(8)
  })

  it('rejects non-numeric, fractional, padded, and sub-1 pages', () => {
    for (const value of ['0', '-1', '1.5', '2.0', '01', '00', 'abc', '8foo', ' 2', '2 ', '+2', '1e2', 'NaN']) {
      expect(parsePageNumber(value), value).toBeNull()
    }
  })

  it('rejects integers past the safe range', () => {
    expect(parsePageNumber('9007199254740993')).toBeNull()
  })
})

describe('isPageInRange', () => {
  it('keeps a page only when that page exists', () => {
    expect(isPageInRange(1, 2)).toBe(true)
    expect(isPageInRange(2, 2)).toBe(true)
    expect(isPageInRange(3, 2)).toBe(false)
    expect(isPageInRange(99, 2)).toBe(false)
    expect(isPageInRange(2, 1)).toBe(false)
  })
})

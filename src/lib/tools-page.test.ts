import { describe, expect, it } from 'vitest'
import { isToolsPageInRange, parseToolsPage } from './tools-page'

describe('parseToolsPage', () => {
  it('treats a missing page as the first page', () => {
    expect(parseToolsPage('')).toBe(1)
  })

  it('accepts canonical page numbers', () => {
    expect(parseToolsPage('1')).toBe(1)
    expect(parseToolsPage('2')).toBe(2)
    expect(parseToolsPage('8')).toBe(8)
    expect(parseToolsPage('99')).toBe(99)
  })

  it('rejects non-numeric, fractional, padded, and sub-1 pages', () => {
    for (const value of ['0', '-1', '1.5', '2.0', '01', '00', 'abc', '8foo', ' 2', '2 ', '+2', '1e2', 'NaN']) {
      expect(parseToolsPage(value), value).toBeNull()
    }
  })

  it('rejects integers past the safe range', () => {
    expect(parseToolsPage('9007199254740993')).toBeNull()
  })
})

describe('isToolsPageInRange', () => {
  it('keeps a page only when that page exists', () => {
    expect(isToolsPageInRange(1, 7)).toBe(true)
    expect(isToolsPageInRange(7, 7)).toBe(true)
    expect(isToolsPageInRange(8, 7)).toBe(false)
    expect(isToolsPageInRange(99, 7)).toBe(false)
    expect(isToolsPageInRange(2, 1)).toBe(false)
    expect(isToolsPageInRange(1, 1)).toBe(true)
  })
})

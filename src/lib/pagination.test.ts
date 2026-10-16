import { describe, expect, it } from 'vitest'
import { paginationItems, showingLabel } from './pagination'

describe('numbered pagination', () => {
  it('shows 1–6 of 24 and the last full page', () => {
    expect(showingLabel(1, 6, 24)).toBe('Showing 1–6 of 24')
    expect(showingLabel(2, 6, 24)).toBe('Showing 7–12 of 24')
    expect(showingLabel(4, 6, 24)).toBe('Showing 19–24 of 24')
    expect(showingLabel(5, 6, 25)).toBe('Showing 25–25 of 25')
    expect(showingLabel(1, 6, 0)).toBe('Showing 0 of 0')
  })

  it('uses an ellipsis on the first, middle, and last pages', () => {
    expect(paginationItems(1, 10)).toEqual([1, 2, 3, 'ellipsis', 10])
    expect(paginationItems(5, 10)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10])
    expect(paginationItems(10, 10)).toEqual([1, 'ellipsis', 8, 9, 10])
    expect(paginationItems(1, 5)).toEqual([1, 2, 3, 'ellipsis', 5])
    expect(paginationItems(5, 5)).toEqual([1, 'ellipsis', 3, 4, 5])
    expect(paginationItems(3, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps a short list and a single page free of an ellipsis', () => {
    expect(paginationItems(1, 1)).toEqual([1])
    expect(paginationItems(1, 2)).toEqual([1, 2])
    expect(paginationItems(2, 2)).toEqual([1, 2])
    expect(paginationItems(1, 4)).toEqual([1, 2, 3, 4])
    expect(paginationItems(4, 4)).toEqual([1, 2, 3, 4])
    expect(paginationItems(0, 0)).toEqual([])
  })
})

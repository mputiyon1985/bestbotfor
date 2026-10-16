export type PageToken = number | 'ellipsis'

/**
 * Numbered page window. Always includes the first page, the last page, and
 * the current page with one neighbor on each side. The first and last pages
 * also keep a third number so the ends read "1 2 3 …". A gap becomes one ellipsis.
 */
export function paginationItems(current: number, pageCount: number): PageToken[] {
  if (pageCount < 1) return []
  const safeCurrent = Math.min(Math.max(Math.trunc(current), 1), pageCount)
  const wanted = new Set<number>([1, pageCount])
  for (let page = safeCurrent - 1; page <= safeCurrent + 1; page += 1) {
    if (page >= 1 && page <= pageCount) wanted.add(page)
  }
  if (safeCurrent <= 2 && pageCount >= 3) wanted.add(3)
  if (safeCurrent >= pageCount - 1 && pageCount >= 3) wanted.add(pageCount - 2)
  const pages = [...wanted].filter((page) => page >= 1 && page <= pageCount).sort((a, b) => a - b)
  const items: PageToken[] = []
  for (const page of pages) {
    const previous = items.at(-1)
    if (typeof previous === 'number' && page - previous > 1) items.push('ellipsis')
    items.push(page)
  }
  return items
}

/** Inclusive range label. The dash is an en dash, as in "Showing 1–6 of 24". */
export function showingLabel(page: number, pageSize: number, total: number): string {
  if (total <= 0 || pageSize <= 0) return 'Showing 0 of 0'
  const start = (page - 1) * pageSize + 1
  if (start > total) return `Showing 0 of ${total}`
  const end = Math.min(page * pageSize, total)
  return `Showing ${start}–${end} of ${total}`
}

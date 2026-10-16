/**
 * Page numbers for crawlable lists. An empty query is the first page. Any
 * other value has to be a canonical positive integer (`2`, not `02` or `2.0`).
 * The caller 404s when the number is past the last page.
 */
export function parsePageNumber(value: string): number | null {
  if (value === '') return 1
  if (!/^[1-9][0-9]*$/.test(value)) return null
  const page = Number(value)
  if (!Number.isSafeInteger(page)) return null
  return page
}

export function isPageInRange(page: number, pageCount: number): boolean {
  return pageCount >= 1 && page >= 1 && page <= pageCount
}

/**
 * Page numbers for `/tools`. An empty query is the first page. Any other
 * value has to be a canonical positive integer (`2`, not `02` or `2.0`).
 * The caller compares that integer with the real page count and 404s when
 * the number is past the last page, so each indexable URL is one page.
 */
export function parseToolsPage(value: string): number | null {
  if (value === '') return 1
  if (!/^[1-9][0-9]*$/.test(value)) return null
  const page = Number(value)
  if (!Number.isSafeInteger(page)) return null
  return page
}

export function isToolsPageInRange(page: number, pageCount: number): boolean {
  return pageCount >= 1 && page >= 1 && page <= pageCount
}

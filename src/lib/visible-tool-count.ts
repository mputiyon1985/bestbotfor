import 'server-only'

import { unstable_rethrow } from 'next/navigation'
import { getVisibleToolCount } from './catalog'

/** Homepage count wording. This is the only place that word is written. */
export const VISIBLE_TOOL_COUNT_WORD = 'listed'

/** Whole-number count with en-US grouping. Null when the count is not a usable whole number. */
export function formatVisibleToolCount(count: number): string | null {
  if (!Number.isInteger(count) || count < 0) return null
  const formatted = new Intl.NumberFormat('en-US').format(count)
  const noun = count === 1 ? 'tool' : 'tools'
  return `${formatted} AI ${noun} ${VISIBLE_TOOL_COUNT_WORD}`
}

/**
 * Homepage hero count. getVisibleToolCount is cached; a failed read hides the
 * text so the page still renders.
 */
export async function visibleToolCountLabel(read: () => Promise<number> = getVisibleToolCount): Promise<string | null> {
  try {
    return formatVisibleToolCount(await read())
  } catch (error) {
    unstable_rethrow(error)
    console.error(`[catalog] visible tool count unavailable (${error instanceof Error ? error.name : 'unknown'})`)
    return null
  }
}

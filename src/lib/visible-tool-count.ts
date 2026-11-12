import 'server-only'

import { unstable_rethrow } from 'next/navigation'
import { getVisibleToolCount } from './catalog'

/**
 * Homepage count wording. This is the only place that word is written.
 * The hero reads “{formatted} AI {noun} {word}.” The digits are not repeated.
 */
export const VISIBLE_TOOL_COUNT_WORD = 'tracked'

export type VisibleToolCountText = {
  /** en-US grouped digits, such as "1,260". */
  formatted: string
  noun: 'tool' | 'tools'
}

/** Whole-number count with en-US grouping. Null when the count is not a positive whole number. */
export function formatVisibleToolCount(count: number): VisibleToolCountText | null {
  if (!Number.isInteger(count) || count < 1) return null
  return {
    formatted: new Intl.NumberFormat('en-US').format(count),
    noun: count === 1 ? 'tool' : 'tools',
  }
}

/**
 * Homepage hero count. getVisibleToolCount is cached; a failed read hides the
 * stat so the page still renders. The same read as the old “AI tools listed” line.
 */
export async function visibleToolCountLabel(read: () => Promise<number> = getVisibleToolCount): Promise<VisibleToolCountText | null> {
  try {
    return formatVisibleToolCount(await read())
  } catch (error) {
    unstable_rethrow(error)
    console.error(`[catalog] visible tool count unavailable (${error instanceof Error ? error.name : 'unknown'})`)
    return null
  }
}

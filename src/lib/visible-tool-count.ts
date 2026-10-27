import 'server-only'

import { unstable_rethrow } from 'next/navigation'
import { getVisibleToolCount } from './catalog'

/** "1,260 AI tools rated". Null when the count is not a usable whole number. */
export function formatVisibleToolCount(count: number): string | null {
  if (!Number.isInteger(count) || count < 0) return null
  const formatted = new Intl.NumberFormat('en-US').format(count)
  const noun = count === 1 ? 'tool' : 'tools'
  return `${formatted} AI ${noun} rated`
}

/**
 * Homepage hero line. getVisibleToolCount is cached; a failed read hides the
 * line so the page still renders.
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

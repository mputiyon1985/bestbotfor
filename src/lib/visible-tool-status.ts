import { eq } from 'drizzle-orm'
import { tools } from './db/schema'

/**
 * Public catalog visibility. Directory, search, quiz, and sitemap queries
 * keep a tool only when tools.status equals this value. Unlisted, hidden,
 * and draft rows stay in the database and are not shown.
 */
export const VISIBLE_TOOL_STATUS = 'active'

/** SQL form of {@link VISIBLE_TOOL_STATUS}. Every public tool query uses this. */
export function visibleToolStatus() {
  return eq(tools.status, VISIBLE_TOOL_STATUS)
}

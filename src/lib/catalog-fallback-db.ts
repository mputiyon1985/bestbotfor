import 'server-only'

import { existsSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import type { Database } from './db'
import * as schema from './db/schema'

/** Built at prebuild from the bundled seeds by scripts/build-catalog-fallback.ts. */
export const CATALOG_FALLBACK_FILE = path.join(process.cwd(), 'data', 'catalog-fallback.db')

let fallbackDb: Database | null | undefined

/** Read-only use only: catalog SELECTs when Turso is unavailable. Null when the file is absent. */
export function getCatalogFallbackDb(): Database | null {
  if (fallbackDb !== undefined) return fallbackDb
  if (!existsSync(CATALOG_FALLBACK_FILE)) {
    fallbackDb = null
    return null
  }
  const client = createClient({ url: `file:${CATALOG_FALLBACK_FILE}` })
  fallbackDb = drizzle(client, { schema }) as Database
  return fallbackDb
}

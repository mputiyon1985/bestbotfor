import 'server-only'

import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import type { Database } from './db'
import * as schema from './db/schema'

/** Built at prebuild from the bundled seeds by scripts/build-catalog-fallback.ts. */
export const CATALOG_FALLBACK_FILE = path.join(process.cwd(), 'data', 'catalog-fallback.db')

let fallbackDb: Database | undefined

/**
 * Opens a private copy of the snapshot in the OS temp dir. The deployed bundle
 * is on a read-only filesystem, and SQLite may need to create sidecar files
 * next to the database it opens; /tmp is writable on Vercel functions.
 * Returns null (without memoizing) when the snapshot is absent, so a later call can retry.
 */
export function openCatalogFallbackDb(source: string = CATALOG_FALLBACK_FILE, workDir: string = tmpdir()): Database | null {
  if (!existsSync(source)) return null
  const copy = path.join(workDir, `bbf-catalog-fallback-${process.pid}.db`)
  if (!existsSync(copy)) {
    // Copy to a unique temp name, then rename: rename is atomic on one filesystem,
    // so a crash mid-copy never leaves a truncated file at the final path.
    const partial = `${copy}.${Date.now()}-${Math.random().toString(36).slice(2)}.partial`
    try {
      copyFileSync(source, partial)
      renameSync(partial, copy)
    } finally {
      rmSync(partial, { force: true })
    }
  }
  const client = createClient({ url: `file:${copy}` })
  return drizzle(client, { schema }) as Database
}

/** Read-only use only: catalog SELECTs when Turso is unavailable. Null when the file is absent. */
export function getCatalogFallbackDb(): Database | null {
  if (fallbackDb) return fallbackDb
  const db = openCatalogFallbackDb()
  if (db) fallbackDb = db
  return db
}

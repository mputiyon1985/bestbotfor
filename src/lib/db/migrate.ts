import { mkdir, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { requireSafeDbTarget } from './guard'
import { createClient, type Client } from '@libsql/client'

/**
 * libsql file URLs. `:memory:` has no directory. `file://` URLs use the URL
 * pathname; `file:./relative.db` keeps the relative path.
 */
export function sqliteFilePath(url: string): string | null {
  if (!url.startsWith('file:')) return null
  const withoutQuery = url.split('?')[0] ?? url
  const rest = withoutQuery.slice('file:'.length)
  if (rest === ':memory:' || rest.startsWith(':memory:')) return null
  if (rest.startsWith('//')) {
    try {
      const pathname = decodeURIComponent(new URL(withoutQuery).pathname)
      return pathname && pathname !== '/' ? pathname : null
    } catch {
      return null
    }
  }
  return rest || null
}

/**
 * Columns on `sponsorships` in src/lib/db/schema.ts. Nullable columns use the
 * same type as the old 0005 table. NOT NULL columns that have to be added
 * later get a default, because SQLite rejects NOT NULL without one when the
 * table already has rows. `id` is the primary key and is not added later.
 * A UNIQUE column cannot be added, so a missing checkout-session id is added
 * as text and then covered by a unique index.
 */
const SPONSORSHIP_ADOPT_COLUMNS: ReadonlyArray<{ name: string; ddl: string }> = [
  { name: 'stripe_checkout_session_id', ddl: "TEXT NOT NULL DEFAULT ''" },
  { name: 'stripe_payment_intent_id', ddl: 'TEXT' },
  { name: 'stripe_customer_id', ddl: 'TEXT' },
  { name: 'stripe_price_id', ddl: 'TEXT' },
  { name: 'offering', ddl: "TEXT NOT NULL DEFAULT ''" },
  { name: 'status', ddl: "TEXT NOT NULL DEFAULT 'pending'" },
  { name: 'email', ddl: 'TEXT' },
  { name: 'company', ddl: 'TEXT' },
  { name: 'task_slug', ddl: 'TEXT' },
  { name: 'issue_date', ddl: 'TEXT' },
  { name: 'amount_total', ddl: 'INTEGER' },
  { name: 'currency', ddl: 'TEXT' },
  { name: 'created_at', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'updated_at', ddl: 'INTEGER NOT NULL DEFAULT 0' },
]

/**
 * Adopt an existing sponsorships table. Adds columns and the status index
 * that the application schema expects, and does not drop or delete anything.
 * No-op when the table is absent or already complete.
 */
export async function adoptSponsorshipSchema(client: Client): Promise<void> {
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sponsorships'",
  )
  if (tables.rows.length === 0) return
  const info = await client.execute('PRAGMA table_info(sponsorships)')
  const present = new Set(info.rows.map((row) => String(row.name)))
  let addedSession = false
  for (const column of SPONSORSHIP_ADOPT_COLUMNS) {
    if (present.has(column.name)) continue
    await client.execute(`ALTER TABLE sponsorships ADD COLUMN ${column.name} ${column.ddl}`)
    addedSession = addedSession || column.name === 'stripe_checkout_session_id'
  }
  await client.execute('CREATE INDEX IF NOT EXISTS sponsorships_status_idx ON sponsorships (status)')
  if (addedSession) {
    await client.execute(
      'CREATE UNIQUE INDEX IF NOT EXISTS sponsorships_stripe_checkout_session_id_unique ON sponsorships (stripe_checkout_session_id)',
    )
  }
}

/** Create the parent directory for a file: database. Remote libsql URLs are unchanged. */
export async function ensureSqliteDirectory(url: string): Promise<void> {
  const filePath = sqliteFilePath(url)
  if (!filePath) return
  const directory = path.dirname(filePath)
  if (!directory || directory === '.') return
  await mkdir(directory, { recursive: true })
}

export async function applyMigrations(url: string, authToken?: string): Promise<void> {
  requireSafeDbTarget(url)
  const fileDatabase = url.startsWith('file:')
  if (fileDatabase) await ensureSqliteDirectory(url)
  const client = createClient({
    url,
    authToken: fileDatabase ? undefined : authToken,
  })
  const directory = path.join(process.cwd(), 'drizzle')
  const files = (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `)

  for (const file of files) {
    const existing = await client.execute({
      sql: 'SELECT id FROM schema_migrations WHERE id = ?',
      args: [file],
    })
    if (existing.rows.length > 0) continue
    const sql = await readFile(path.join(directory, file), 'utf8')
    await client.executeMultiple(sql)
    await client.execute({
      sql: 'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
      args: [file, Date.now()],
    })
  }

  // 0009 uses CREATE TABLE IF NOT EXISTS, which does not add columns to the
  // sponsorships table left by the old 0005 preview. Fill any gaps here.
  // Ledger rows whose files are gone, including 0005_sponsorships.sql, are
  // never read, so they are left in place.
  await adoptSponsorshipSchema(client)

  client.close()
}

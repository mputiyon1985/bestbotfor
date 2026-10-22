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
  { name: 'paid_at', ddl: 'INTEGER' },
  { name: 'refunded_at', ddl: 'INTEGER' },
  // Sponsor subscriptions (founding_sponsor, placement_subscription). All nullable.
  { name: 'stripe_subscription_id', ddl: 'TEXT' },
  { name: 'subscription_status', ddl: 'TEXT' },
  { name: 'paid_through', ddl: 'INTEGER' },
  { name: 'price_locked_until', ddl: 'INTEGER' },
  { name: 'cancel_at', ddl: 'INTEGER' },
  { name: 'canceled_at', ddl: 'INTEGER' },
  { name: 'payment_failed_at', ddl: 'INTEGER' },
  { name: 'subscription_event_at', ddl: 'INTEGER' },
]

/**
 * Adopt an existing sponsorships table. Adds columns and the status index
 * that the application schema expects, and does not drop or delete anything.
 * `paid_at` and `refunded_at` are added here because this SQLite build rejects
 * `ADD COLUMN IF NOT EXISTS`. A missing name is added once. A name that is
 * already present is left alone. Paid rows with a null `paid_at` copy
 * `updated_at` once so an existing placement keeps a start time.
 * No-op when the table is absent.
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
  await client.execute(
    'CREATE INDEX IF NOT EXISTS sponsorships_subscription_idx ON sponsorships (stripe_subscription_id)',
  )
  if (addedSession) {
    await client.execute(
      'CREATE UNIQUE INDEX IF NOT EXISTS sponsorships_stripe_checkout_session_id_unique ON sponsorships (stripe_checkout_session_id)',
    )
  }
  await client.execute(
    "UPDATE sponsorships SET paid_at = updated_at WHERE status = 'paid' AND paid_at IS NULL",
  )
}

/**
 * Columns added after 0014. SQLite rejects ADD COLUMN IF NOT EXISTS, so a
 * missing name is added once and a present name is left alone. Nothing is
 * dropped. Fresh databases create the base tables from SQL, then this fills
 * the version, snapshot, and audit columns.
 */
const SPONSOR_CARD_ADOPT_COLUMNS: ReadonlyArray<{ name: string; ddl: string }> = [
  { name: 'version', ddl: 'INTEGER NOT NULL DEFAULT 1' },
  { name: 'content_hash', ddl: 'TEXT' },
  { name: 'rejected_at', ddl: 'INTEGER' },
  { name: 'resubmission_count', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'refund_status', ddl: 'TEXT' },
  { name: 'had_invisible', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'approved_tool_name', ddl: 'TEXT' },
  { name: 'approved_description', ddl: 'TEXT' },
  { name: 'approved_url', ddl: 'TEXT' },
  { name: 'approved_logo_mime', ddl: 'TEXT' },
  { name: 'approved_logo_bytes', ddl: 'BLOB' },
  { name: 'approved_content_hash', ddl: 'TEXT' },
  { name: 'approved_version', ddl: 'INTEGER' },
]

const SPONSOR_REVIEW_ADOPT_COLUMNS: ReadonlyArray<{ name: string; ddl: string }> = [
  { name: 'content_hash', ddl: 'TEXT' },
  { name: 'version', ddl: 'INTEGER' },
]

async function addMissingColumns(
  client: Client,
  table: string,
  columns: ReadonlyArray<{ name: string; ddl: string }>,
): Promise<void> {
  const tables = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [table],
  })
  if (tables.rows.length === 0) return
  const info = await client.execute(`PRAGMA table_info(${table})`)
  const present = new Set(info.rows.map((row) => String(row.name)))
  for (const column of columns) {
    if (present.has(column.name)) continue
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.ddl}`)
  }
}

export async function adoptSponsorCardSchema(client: Client): Promise<void> {
  await addMissingColumns(client, 'sponsorship_creatives', SPONSOR_CARD_ADOPT_COLUMNS)
  await addMissingColumns(client, 'sponsorship_review_events', SPONSOR_REVIEW_ADOPT_COLUMNS)
}

/**
 * Exact DDL for `suggestions`. The SQL file and this adopt helper share it.
 * Additive: missing columns are added, and nothing is dropped or deleted.
 */
export const SUGGESTIONS_DDL = `CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('like', 'add', 'remove')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 2000),
  email TEXT,
  created_at INTEGER NOT NULL
);`

const SUGGESTION_ADOPT_COLUMNS: ReadonlyArray<{ name: string; ddl: string }> = [
  { name: 'kind', ddl: "TEXT NOT NULL DEFAULT 'like'" },
  { name: 'message', ddl: "TEXT NOT NULL DEFAULT ''" },
  { name: 'email', ddl: 'TEXT' },
  { name: 'created_at', ddl: 'INTEGER NOT NULL DEFAULT 0' },
]

/** Create `suggestions` when it is missing, then add any column the app expects. */
export async function adoptSuggestionsSchema(client: Client): Promise<void> {
  await client.execute(SUGGESTIONS_DDL)
  await addMissingColumns(client, 'suggestions', SUGGESTION_ADOPT_COLUMNS)
}

/**
 * A migration file made only of `ALTER TABLE t ADD COLUMN c ...;` statements (and `--`
 * comment lines) is split into its statements, so the runner can skip a column that is
 * already present. That makes such a file safe to re-run after a partial apply: SQLite
 * has no `ADD COLUMN IF NOT EXISTS` and `executeMultiple` is not one transaction, so a
 * crash after the first ALTER and before the ledger insert would otherwise fail the next
 * deploy on "duplicate column". Each statement runs as written in the file (whitespace collapsed).
 * Returns null for any other file (quotes, other statements, or anything unexpected),
 * which then runs through `executeMultiple` exactly as before.
 */
export function addColumnStatements(sql: string): Array<{ table: string; column: string; statement: string }> | null {
  const body = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  if (/['"`]/.test(body)) return null
  const statements = body
    .split(';')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0)
  if (statements.length === 0) return null
  const parsed: Array<{ table: string; column: string; statement: string }> = []
  for (const statement of statements) {
    const match = /^ALTER TABLE ([A-Za-z_][A-Za-z0-9_]*) ADD COLUMN ([A-Za-z_][A-Za-z0-9_]*)(?: [A-Za-z0-9_ ()]*)?$/i.exec(statement)
    if (!match) return null
    parsed.push({ table: match[1] as string, column: match[2] as string, statement })
  }
  return parsed
}

async function applyAddColumnFile(
  client: Client,
  statements: ReadonlyArray<{ table: string; column: string; statement: string }>,
): Promise<void> {
  for (const { table, column, statement } of statements) {
    const info = await client.execute(`PRAGMA table_info(${table})`)
    if (info.rows.some((row) => String(row.name) === column)) continue
    await client.execute(statement)
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

export async function applyMigrations(url: string, authToken?: string, migrationsDirectory?: string): Promise<void> {
  requireSafeDbTarget(url)
  const fileDatabase = url.startsWith('file:')
  if (fileDatabase) await ensureSqliteDirectory(url)
  const client = createClient({
    url,
    authToken: fileDatabase ? undefined : authToken,
  })
  const directory = migrationsDirectory ?? path.join(process.cwd(), 'drizzle')
  // Each file is applied on its own ledger row, in filename order. A higher
  // number that is already on disk runs even when an earlier number is absent.
  // When that earlier file arrives later, it still runs, because its name is
  // not in schema_migrations. 0011 and 0012 landed before 0009 this way.
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
    const addColumns = addColumnStatements(sql)
    if (addColumns) await applyAddColumnFile(client, addColumns)
    else await client.executeMultiple(sql)
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
  await adoptSponsorCardSchema(client)
  await adoptSuggestionsSchema(client)

  client.close()
}

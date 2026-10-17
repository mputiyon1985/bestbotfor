import { mkdir, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { requireSafeDbTarget } from './guard'
import { createClient } from '@libsql/client'

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
    await client.executeMultiple(sql)
    await client.execute({
      sql: 'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
      args: [file, Date.now()],
    })
  }

  client.close()
}

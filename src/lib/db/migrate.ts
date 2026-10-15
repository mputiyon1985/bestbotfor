import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@libsql/client'

export async function applyMigrations(url: string, authToken?: string): Promise<void> {
  const fileDatabase = url.startsWith('file:')
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

  client.close()
}

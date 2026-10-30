import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getDb, resetDbCache } from '@/lib/db/client'
import { applyMigrations } from '@/lib/db/migrate'

/** Point the site database at a temporary file and apply migrations, including signups admin tables. */
export async function withSignupsAuthDb(): Promise<() => Promise<void>> {
  const root = await mkdtemp(path.join(tmpdir(), 'signups-auth-'))
  const previousUrl = process.env.TURSO_DATABASE_URL
  const previousToken = process.env.TURSO_AUTH_TOKEN
  const url = `file:${path.join(root, 'auth.db')}`
  process.env.TURSO_DATABASE_URL = url
  delete process.env.TURSO_AUTH_TOKEN
  resetDbCache()
  await applyMigrations(url)
  resetDbCache()
  return async () => {
    try {
      getDb().$client.close()
    } catch {
      // The database was not opened.
    }
    resetDbCache()
    if (previousUrl === undefined) delete process.env.TURSO_DATABASE_URL
    else process.env.TURSO_DATABASE_URL = previousUrl
    if (previousToken === undefined) delete process.env.TURSO_AUTH_TOKEN
    else process.env.TURSO_AUTH_TOKEN = previousToken
    await rm(root, { recursive: true, force: true })
  }
}

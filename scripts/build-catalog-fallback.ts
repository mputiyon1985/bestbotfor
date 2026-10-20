/**
 * Builds data/catalog-fallback.db from the bundled seed files only (never from a
 * hosted database). Pages read it only when Turso errors and there is no cached
 * or last-good value, so a read outage serves the seeded catalog instead of a 500.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@libsql/client'

const file = path.join(process.cwd(), 'data', 'catalog-fallback.db')
for (const suffix of ['', '-wal', '-shm', '-journal']) if (existsSync(file + suffix)) rmSync(file + suffix)

// prepare-db applies migrations and seeds. Run it with the URL forced to the local file.
const env: NodeJS.ProcessEnv = { ...process.env, TURSO_DATABASE_URL: `file:${file}`, TURSO_AUTH_TOKEN: '' }
execFileSync(process.execPath, [path.join('node_modules', 'tsx', 'dist', 'cli.mjs'), 'scripts/prepare-db.ts'], { env, stdio: 'inherit' })

async function finish() {
  const client = createClient({ url: `file:${file}` })
  // A serverless filesystem is read-only, so the file must not need -wal/-shm sidecars.
  await client.execute('PRAGMA wal_checkpoint(TRUNCATE)')
  await client.execute('PRAGMA journal_mode = DELETE')
  await client.execute('VACUUM')
  client.close()
  for (const suffix of ['-wal', '-shm']) if (existsSync(file + suffix)) rmSync(file + suffix)
  console.log('Catalog fallback database built.')
}

finish().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Catalog fallback build failed')
  process.exit(1)
})

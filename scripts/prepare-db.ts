import { assertSafeDbTarget } from '../src/lib/db/guard'
import { applyMigrations } from '../src/lib/db/migrate'
import { seed } from './seed'

async function main(): Promise<void> {
  const url = process.env.TURSO_DATABASE_URL?.trim()
  if (!url) {
    console.error('Set TURSO_DATABASE_URL. For local development, file:./data/local.db works.')
    process.exit(1)
  }
  assertSafeDbTarget(url)
  await applyMigrations(url, process.env.TURSO_AUTH_TOKEN?.trim())
  await seed()
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Database setup failed')
  process.exit(1)
})

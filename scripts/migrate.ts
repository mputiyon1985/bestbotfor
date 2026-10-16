import { assertSafeDbTarget } from '../src/lib/db/guard'
import { applyMigrations } from '../src/lib/db/migrate'

async function main(): Promise<void> {
  const url = process.env.TURSO_DATABASE_URL?.trim()
  if (!url) {
    console.error('Set TURSO_DATABASE_URL before migrating.')
    process.exit(1)
  }
  assertSafeDbTarget(url)
  await applyMigrations(url, process.env.TURSO_AUTH_TOKEN?.trim())
  console.log('Migrations applied.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Migration failed')
  process.exit(1)
})

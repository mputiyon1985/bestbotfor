import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const ALLOWED = new Set([
  'src/lib/rate-limit.ts',
  'src/lib/db/client.ts',
  'src/lib/newsletter.ts',
  'src/lib/stripe-webhook.ts',
  'src/lib/members.ts',
  'src/app/go/[slug]/route.ts',
  'src/lib/db/migrate.ts',
  'scripts/seed.ts',
  'scripts/migrate.ts',
  'drizzle/0004_retire_quiz_fits.sql',
  'drizzle/0007_drop_non_forge_scores.sql',
  'drizzle/0011_user_reviews.sql',
])

const ROOTS = ['src', 'scripts', 'drizzle']

export function isWrite(line: string): boolean {
  if (/\b(?:db|client)\s*\.\s*(?:insert|update|delete|execute)\s*\(/.test(line)) return true
  if (/\$client\s*\.\s*execute\s*\(/.test(line)) return true
  if (/\bexecuteMultiple\s*\(/.test(line)) return true
  if (/\bINSERT\s+INTO\b/i.test(line)) return true
  if (/\bDELETE\s+FROM\b/i.test(line)) return true
  if (/\bDO\s+UPDATE\s+SET\b/i.test(line)) return true
  // A template-string argument can still be a SQL UPDATE statement.
  // The HMAC line `.update(`bestbotfor-rate|...`)` has no UPDATE keyword.
  if (/\bUPDATE\s+\w+\s+SET\b/i.test(line)) return true
  // Drizzle chains `.update(table)`, `.update($set)`, or a bare `.update(`.
  // HMAC `.update(\`...\`)` is not SQL. `$` here is a Drizzle identifier, not end of line.
  if (/^\s*\.(?:insert|update|delete)\s*\(\s*(?:\$|[A-Za-z_]|$)/.test(line)) return true
  return false
}

function skipped(relative: string): boolean {
  if (relative.endsWith('.test.ts')) return true
  if (relative.startsWith('src/test/')) return true
  return false
}

async function filesIn(directory: string): Promise<string[]> {
  const found: string[] = []
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      found.push(...(await filesIn(full)))
      continue
    }
    if (!/\.(?:ts|tsx|sql)$/.test(entry.name)) continue
    found.push(full)
  }
  return found
}

async function main(): Promise<void> {
  const hits: string[] = []
  for (const root of ROOTS) {
    for (const full of await filesIn(path.join(process.cwd(), root))) {
      const relative = path.relative(process.cwd(), full)
      if (skipped(relative)) continue
      const text = await readFile(full, 'utf8')
      const lines = text.split('\n')
      lines.forEach((line, index) => {
        if (!isWrite(line)) return
        if (ALLOWED.has(relative)) return
        hits.push(`${relative}:${index + 1}`)
      })
    }
  }

  if (hits.length > 0) {
    console.error('Database writes are only allowed in the reviewed files. Found:')
    for (const hit of hits) console.error(hit)
    process.exit(1)
  }
  console.log('Database writes stay inside the allowlist.')
}

const entry = process.argv[1]
const invokedDirectly = entry
  ? entry.endsWith(`${path.sep}check-db-writes.ts`) || entry.endsWith(`${path.sep}check-db-writes.js`)
  : false

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'DB write check failed')
    process.exit(1)
  })
}

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { assertSafeDbTarget } from '../src/lib/db/guard'
import { getDb, resetDbCache } from '../src/lib/db/client'
import { parseLeadCsv, parseLeadJson } from '../src/lib/leads/parse'
import { leadsScriptRefuses } from '../src/lib/leads/script'
import { upsertLeads } from '../src/lib/leads/store'

/**
 * Upsert leads from a local JSON or CSV file.
 * Prints counts only. Does not print addresses.
 * Refuses a production database unless --production-launch is set.
 * Does not apply migrations. The bbf_leads table has to exist already.
 *
 * npm run leads:upsert -- ./leads.json
 * npm run leads:upsert -- ./leads.csv
 */
async function main(): Promise<void> {
  const productionLaunch = process.argv.includes('--production-launch')
  const args = process.argv.slice(2).filter((arg) => arg !== '--production-launch')
  const file = args[0]
  if (!file || args.length !== 1) {
    console.error('Pass one local .json or .csv file.')
    process.exit(1)
  }

  const url = process.env.TURSO_DATABASE_URL?.trim()
  if (!url) {
    console.error('Set TURSO_DATABASE_URL before upserting leads.')
    process.exit(1)
  }
  assertSafeDbTarget(url)
  if (leadsScriptRefuses(url, productionLaunch)) {
    console.error('Refusing to upsert leads on a production database. Pass --production-launch only after Mark approves.')
    process.exit(1)
  }

  const extension = path.extname(file).toLowerCase()
  if (extension !== '.json' && extension !== '.csv') {
    console.error('Pass a .json or .csv file.')
    process.exit(1)
  }

  let size = 0
  try {
    size = (await stat(file)).size
  } catch {
    console.error('Could not read the file.')
    process.exit(1)
  }
  if (size > 1_000_000) {
    console.error('File is too large.')
    process.exit(1)
  }

  let text = ''
  try {
    text = await readFile(file, 'utf8')
  } catch {
    console.error('Could not read the file.')
    process.exit(1)
  }

  const parsed = extension === '.csv' ? parseLeadCsv(text) : parseJson(text)
  if (!parsed.ok) {
    console.error(parsed.errors.join('\n'))
    process.exit(1)
  }

  resetDbCache()
  try {
    const count = await upsertLeads(getDb(), parsed.rows)
    console.log(`upserted: ${count}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('no such table')) {
      console.error('bbf_leads is missing. Apply migrations on a non-production database first.')
    } else {
      console.error('Upsert failed.')
    }
    process.exit(1)
  }
}

function parseJson(text: string): ReturnType<typeof parseLeadJson> {
  try {
    return parseLeadJson(JSON.parse(text) as unknown)
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] }
  }
}

main().catch(() => {
  console.error('Upsert failed.')
  process.exit(1)
})

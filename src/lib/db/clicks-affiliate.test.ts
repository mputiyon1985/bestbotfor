import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, describe, expect, it } from 'vitest'
import { clicks } from './schema'
import { addColumnStatements, applyMigrations } from './migrate'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function freshUrl() {
  const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-clicks-'))
  directories.push(root)
  return `file:${path.join(root, 'app.db')}`
}

describe('0026 clicks affiliate columns', () => {
  it('adds a defaulted affiliate flag and a nullable program id', async () => {
    const url = await freshUrl()
    await applyMigrations(url)
    const client = createClient({ url })
    const info = await client.execute('PRAGMA table_info(clicks)')
    const affiliate = info.rows.find((row) => row.name === 'affiliate')
    const program = info.rows.find((row) => row.name === 'program_id')
    expect(String(affiliate?.type)).toBe('INTEGER')
    expect(Number(affiliate?.notnull)).toBe(1)
    expect(String(affiliate?.dflt_value)).toBe('0')
    expect(String(program?.type)).toBe('INTEGER')
    expect(Number(program?.notnull)).toBe(0)
    expect(program?.dflt_value).toBeNull()
    const db = drizzle(client)
    const [row] = await db
      .insert(clicks)
      .values({ toolId: 1, page: '/best/voice', ts: 1, country: null, ipHash: null, affiliate: true, programId: 7 })
      .returning({ id: clicks.id, affiliate: clicks.affiliate, programId: clicks.programId })
    expect(row).toMatchObject({ id: 1, affiliate: true, programId: 7 })
    client.close()
  })

  it('re-runs cleanly after a partial apply that left one column and no ledger row', async () => {
    const url = await freshUrl()
    await applyMigrations(url)
    const client = createClient({ url })
    await client.execute(
      "INSERT INTO clicks (tool_id, page, ts, country, ip_hash, affiliate) VALUES (1, '/tools/cursor', 5, 'US', 'hash', 0)",
    )
    await client.execute('ALTER TABLE clicks DROP COLUMN program_id')
    await client.execute("DELETE FROM schema_migrations WHERE id = '0026_clicks_affiliate.sql'")
    client.close()

    await applyMigrations(url)
    const again = createClient({ url })
    const names = (await again.execute('PRAGMA table_info(clicks)')).rows.map((row) => String(row.name))
    expect(names.filter((name) => name === 'affiliate')).toEqual(['affiliate'])
    expect(names.filter((name) => name === 'program_id')).toEqual(['program_id'])
    const kept = await again.execute('SELECT page, affiliate, program_id FROM clicks')
    expect(kept.rows).toEqual([{ page: '/tools/cursor', affiliate: 0, program_id: null }])
    const ledger = await again.execute("SELECT id FROM schema_migrations WHERE id = '0026_clicks_affiliate.sql'")
    expect(ledger.rows).toHaveLength(1)
    again.close()
    await applyMigrations(url)
  })

  it('keeps the file to the two approved ADD COLUMN statements', async () => {
    const sql = await readFile(path.join(process.cwd(), 'drizzle/0026_clicks_affiliate.sql'), 'utf8')
    expect(addColumnStatements(sql)).toEqual([
      {
        table: 'clicks',
        column: 'affiliate',
        statement: 'ALTER TABLE clicks ADD COLUMN affiliate INTEGER NOT NULL DEFAULT 0',
      },
      {
        table: 'clicks',
        column: 'program_id',
        statement: 'ALTER TABLE clicks ADD COLUMN program_id INTEGER',
      },
    ])
  })
})

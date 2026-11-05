import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
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

describe('0027 clicks affiliate columns', () => {
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
    await client.execute("DELETE FROM schema_migrations WHERE id = '0027_clicks_affiliate.sql'")
    client.close()

    await applyMigrations(url)
    const again = createClient({ url })
    const names = (await again.execute('PRAGMA table_info(clicks)')).rows.map((row) => String(row.name))
    expect(names.filter((name) => name === 'affiliate')).toEqual(['affiliate'])
    expect(names.filter((name) => name === 'program_id')).toEqual(['program_id'])
    const kept = await again.execute('SELECT page, affiliate, program_id FROM clicks')
    expect(kept.rows).toEqual([{ page: '/tools/cursor', affiliate: 0, program_id: null }])
    const ledger = await again.execute("SELECT id FROM schema_migrations WHERE id = '0027_clicks_affiliate.sql'")
    expect(ledger.rows).toHaveLength(1)
    again.close()
    await applyMigrations(url)
  })

  it('keeps the file to the two approved ADD COLUMN statements', async () => {
    const sql = await readFile(path.join(process.cwd(), 'drizzle/0027_clicks_affiliate.sql'), 'utf8')
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

const CLICKS_FILE = '0027_clicks_affiliate.sql'
const SPONSOR_FILE = '0026_sponsor_abandoned_checkouts.sql'

async function migrationCopy(): Promise<{ dir: string; url: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-migrate-order-'))
  directories.push(root)
  const dir = path.join(root, 'drizzle')
  await cp(path.join(process.cwd(), 'drizzle'), dir, { recursive: true })
  return { dir, url: `file:${path.join(root, 'app.db')}` }
}

async function schemaState(url: string) {
  const client = createClient({ url })
  const clicks = await client.execute('PRAGMA table_info(clicks)')
  const names = clicks.rows.map((row) => String(row.name))
  const sponsor = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sponsor_abandoned_checkouts'",
  )
  const sponsorColumns =
    sponsor.rows.length === 1
      ? (await client.execute('PRAGMA table_info(sponsor_abandoned_checkouts)')).rows.map((row) => String(row.name))
      : []
  const ledger = await client.execute('SELECT id, applied_at FROM schema_migrations ORDER BY id')
  client.close()
  return {
    affiliate: names.includes('affiliate'),
    programId: names.includes('program_id'),
    sponsor: sponsor.rows.length === 1,
    promotionsConsent: sponsorColumns.includes('promotions_consent'),
    consentedAt: sponsorColumns.includes('consented_at'),
    ledger: ledger.rows.map((row) => String(row.id)),
    appliedAt: new Map(ledger.rows.map((row) => [String(row.id), Number(row.applied_at)])),
  }
}

describe('0026 and 0027 apply in either order', () => {
  it('applies the sponsor table first, then the click columns', async () => {
    const { dir, url } = await migrationCopy()
    await rm(path.join(dir, CLICKS_FILE))
    await applyMigrations(url, undefined, dir)
    const afterSponsor = await schemaState(url)
    expect(afterSponsor.sponsor).toBe(true)
    expect(afterSponsor.promotionsConsent).toBe(true)
    expect(afterSponsor.consentedAt).toBe(true)
    expect(afterSponsor.affiliate).toBe(false)
    expect(afterSponsor.ledger).toContain(SPONSOR_FILE)
    expect(afterSponsor.ledger).not.toContain(CLICKS_FILE)

    await cp(path.join(process.cwd(), 'drizzle', CLICKS_FILE), path.join(dir, CLICKS_FILE))
    await applyMigrations(url, undefined, dir)
    const afterClicks = await schemaState(url)
    expect(afterClicks.sponsor).toBe(true)
    expect(afterClicks.promotionsConsent).toBe(true)
    expect(afterClicks.consentedAt).toBe(true)
    expect(afterClicks.affiliate).toBe(true)
    expect(afterClicks.programId).toBe(true)
    expect(afterClicks.ledger).toContain(SPONSOR_FILE)
    expect(afterClicks.ledger).toContain(CLICKS_FILE)
  })

  it('applies the click columns first, then the sponsor table', async () => {
    const { dir, url } = await migrationCopy()
    await rm(path.join(dir, SPONSOR_FILE))
    await applyMigrations(url, undefined, dir)
    const afterClicks = await schemaState(url)
    expect(afterClicks.affiliate).toBe(true)
    expect(afterClicks.programId).toBe(true)
    // adoptSponsorAbandonedCheckouts creates the table even when 0026 is absent.
    // The ledger is what shows the real file has not run yet.
    expect(afterClicks.ledger).toContain(CLICKS_FILE)
    expect(afterClicks.ledger).not.toContain(SPONSOR_FILE)

    await cp(path.join(process.cwd(), 'drizzle', SPONSOR_FILE), path.join(dir, SPONSOR_FILE))
    await applyMigrations(url, undefined, dir)
    const afterSponsor = await schemaState(url)
    expect(afterSponsor.affiliate).toBe(true)
    expect(afterSponsor.programId).toBe(true)
    expect(afterSponsor.sponsor).toBe(true)
    expect(afterSponsor.promotionsConsent).toBe(true)
    expect(afterSponsor.consentedAt).toBe(true)
    expect(afterSponsor.ledger).toContain(CLICKS_FILE)
    expect(afterSponsor.ledger).toContain(SPONSOR_FILE)
    expect(afterSponsor.ledger.filter((id) => id === SPONSOR_FILE)).toHaveLength(1)
  })

  it('applies both in filename order when they arrive together', async () => {
    const { dir, url } = await migrationCopy()
    await applyMigrations(url, undefined, dir)
    const state = await schemaState(url)
    expect(state.affiliate).toBe(true)
    expect(state.programId).toBe(true)
    expect(state.sponsor).toBe(true)
    expect(state.promotionsConsent).toBe(true)
    expect(state.consentedAt).toBe(true)
    const sponsorAt = state.appliedAt.get(SPONSOR_FILE)
    const clicksAt = state.appliedAt.get(CLICKS_FILE)
    expect(sponsorAt).toBeTypeOf('number')
    expect(clicksAt).toBeTypeOf('number')
    expect(clicksAt ?? 0).toBeGreaterThanOrEqual(sponsorAt ?? 0)
    await applyMigrations(url, undefined, dir)
    const again = await schemaState(url)
    expect(again.ledger.filter((id) => id === SPONSOR_FILE)).toHaveLength(1)
    expect(again.ledger.filter((id) => id === CLICKS_FILE)).toHaveLength(1)
  })
})

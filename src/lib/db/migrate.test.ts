import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, describe, expect, it } from 'vitest'
import { applyMigrations, ensureSqliteDirectory, sqliteFilePath } from './migrate'

const directories: string[] = []

/** Executable DDL from 66d41ea drizzle/0005_sponsorships.sql, comments removed. */
const OLD_0005_SPONSORSHIPS_SQL = `
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sponsorships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_checkout_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  stripe_price_id TEXT,
  offering TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
  email TEXT,
  company TEXT,
  task_slug TEXT,
  issue_date TEXT,
  amount_total INTEGER,
  currency TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sponsorships_status_idx ON sponsorships (status);
`.trim()

const MAIN_MIGRATIONS = [
  '0001_init.sql',
  '0002_catalog_indexes.sql',
  '0003_tool_tasks_unique.sql',
  '0004_retire_quiz_fits.sql',
  '0005_tool_scores_pros_cons.sql',
  '0006_tool_needs_verification.sql',
  '0007_drop_non_forge_scores.sql',
  '0008_ratings_v23.sql',
]

function executableSql(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('sqlite file directories', () => {
  it('finds a relative file path and ignores memory and remote URLs', () => {
    expect(sqliteFilePath('file:./data/local.db')).toBe('./data/local.db')
    expect(sqliteFilePath('file:/tmp/bestbotfor/app.db')).toBe('/tmp/bestbotfor/app.db')
    expect(sqliteFilePath('file::memory:')).toBeNull()
    expect(sqliteFilePath('libsql://example.turso.io')).toBeNull()
  })

  it('creates a missing parent directory before migrations', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-missing-'))
    directories.push(root)
    const nested = path.join(root, 'does-not-exist', 'nested')
    const url = `file:${nested}/app.db`
    expect(existsSync(nested)).toBe(false)
    await ensureSqliteDirectory(url)
    expect(existsSync(nested)).toBe(true)
    await applyMigrations(url)
    expect(existsSync(path.join(nested, 'app.db'))).toBe(true)
  })

  it('applies 0004_retire_quiz_fits.sql when 0003_tool_tasks_unique.sql is already recorded', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-migrate-'))
    directories.push(root)
    const url = `file:${path.join(root, 'migrate.db')}`
    await applyMigrations(url)

    const client = createClient({ url })
    const recorded = await client.execute('SELECT id FROM schema_migrations ORDER BY id')
    const ids = recorded.rows.map((row) => String(row.id))
    expect(ids).toContain('0003_tool_tasks_unique.sql')
    expect(ids).toContain('0004_retire_quiz_fits.sql')
    expect(ids).toContain('0005_tool_scores_pros_cons.sql')
    expect(ids).toContain('0006_tool_needs_verification.sql')
    expect(ids).toContain('0007_drop_non_forge_scores.sql')
    expect(ids).toContain('0008_ratings_v23.sql')
    const columns = await client.execute('PRAGMA table_info(tools)')
    expect(columns.rows.some((row) => row.name === 'needs_verification')).toBe(true)
    const scoreColumns = await client.execute('PRAGMA table_info(tool_scores)')
    const scoreNames = scoreColumns.rows.map((row) => String(row.name))
    expect(scoreNames).toEqual(expect.arrayContaining(['primary_category', 'category_rank_display', 'tie_group', 'note', 'rating_status', 'quiz_eligible']))
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('tool_scores', 'tool_pros_cons') ORDER BY name",
    )
    expect(tables.rows.map((row) => String(row.name))).toEqual(['tool_pros_cons', 'tool_scores'])
    await client.execute({
      sql: 'DELETE FROM schema_migrations WHERE id = ?',
      args: ['0004_retire_quiz_fits.sql'],
    })
    client.close()

    await applyMigrations(url)
    const again = createClient({ url })
    const after = await again.execute('SELECT id FROM schema_migrations ORDER BY id')
    const afterIds = after.rows.map((row) => String(row.id))
    expect(afterIds.filter((id) => id === '0004_retire_quiz_fits.sql')).toEqual(['0004_retire_quiz_fits.sql'])
    expect(afterIds).toContain('0003_tool_tasks_unique.sql')
    const index = await again.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'tool_tasks_tool_task_unique'",
    )
    expect(index.rows).toHaveLength(1)
    again.close()

    await applyMigrations(url)
    const third = createClient({ url })
    const count = await third.execute('SELECT COUNT(*) AS n FROM schema_migrations')
    expect(Number(count.rows[0]?.n)).toBe(afterIds.length)
    third.close()
  })

  it('applies 0009_sponsorships.sql after 0008_ratings_v23.sql and keeps stripe_events', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-sponsor-migrate-'))
    directories.push(root)
    const url = `file:${path.join(root, 'migrate.db')}`
    await applyMigrations(url)
    const client = createClient({ url })
    const recorded = await client.execute('SELECT id FROM schema_migrations ORDER BY id')
    const ids = recorded.rows.map((row) => String(row.id))
    expect(ids).toEqual([
      '0001_init.sql',
      '0002_catalog_indexes.sql',
      '0003_tool_tasks_unique.sql',
      '0004_retire_quiz_fits.sql',
      '0005_tool_scores_pros_cons.sql',
      '0006_tool_needs_verification.sql',
      '0007_drop_non_forge_scores.sql',
      '0008_ratings_v23.sql',
      '0009_sponsorships.sql',
    ])
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('stripe_events', 'sponsorships') ORDER BY name",
    )
    expect(tables.rows.map((row) => String(row.name))).toEqual(['sponsorships', 'stripe_events'])
    const columns = await client.execute('PRAGMA table_info(sponsorships)')
    expect(columns.rows.map((row) => String(row.name))).toEqual([
      'id',
      'stripe_checkout_session_id',
      'stripe_payment_intent_id',
      'stripe_customer_id',
      'stripe_price_id',
      'offering',
      'status',
      'email',
      'company',
      'task_slug',
      'issue_date',
      'amount_total',
      'currency',
      'created_at',
      'updated_at',
    ])
    client.close()
  })

  it('keeps 0009 DDL identical to the old 0005 sponsorships migration', async () => {
    const current = await readFile(path.join(process.cwd(), 'drizzle/0009_sponsorships.sql'), 'utf8')
    expect(executableSql(current)).toBe(executableSql(OLD_0005_SPONSORSHIPS_SQL))
  })

  it('applies 0009 on a database that already has main migrations and the old 0005 table', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-stray-0005-'))
    directories.push(root)
    const url = `file:${path.join(root, 'stray.db')}`
    const client = createClient({ url })
    for (const file of MAIN_MIGRATIONS) {
      const sql = await readFile(path.join(process.cwd(), 'drizzle', file), 'utf8')
      await client.executeMultiple(sql)
      await client.execute({
        sql: 'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
        args: [file, 1],
      })
    }
    await client.executeMultiple(OLD_0005_SPONSORSHIPS_SQL)
    await client.execute({
      sql: 'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
      args: ['0005_sponsorships.sql', 1_762_000_000_000],
    })
    await client.execute({
      sql: `INSERT INTO sponsorships (
        stripe_checkout_session_id, offering, status, company, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: ['cs_test_stray_preview', 'placement_weekly', 'pending', 'Stray Preview Co', 1, 1],
    })
    const before = await client.execute('PRAGMA table_info(sponsorships)')
    const beforeSql = await client.execute(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sponsorships'",
    )
    const beforeLedger = await client.execute(
      "SELECT id, applied_at FROM schema_migrations WHERE id = '0005_sponsorships.sql'",
    )
    const beforeRows = await client.execute('SELECT COUNT(*) AS n FROM sponsorships')
    client.close()

    await applyMigrations(url)

    const after = createClient({ url })
    const recorded = await after.execute('SELECT id FROM schema_migrations ORDER BY id')
    expect(recorded.rows.map((row) => String(row.id))).toEqual([
      '0001_init.sql',
      '0002_catalog_indexes.sql',
      '0003_tool_tasks_unique.sql',
      '0004_retire_quiz_fits.sql',
      '0005_sponsorships.sql',
      '0005_tool_scores_pros_cons.sql',
      '0006_tool_needs_verification.sql',
      '0007_drop_non_forge_scores.sql',
      '0008_ratings_v23.sql',
      '0009_sponsorships.sql',
    ])
    const columns = await after.execute('PRAGMA table_info(sponsorships)')
    expect(columns.rows.map((row) => String(row.name))).toEqual(before.rows.map((row) => String(row.name)))
    expect(columns.rows.map((row) => [String(row.name), String(row.type), Number(row.notnull), Number(row.pk)])).toEqual(
      before.rows.map((row) => [String(row.name), String(row.type), Number(row.notnull), Number(row.pk)]),
    )
    const tableSql = await after.execute(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sponsorships'",
    )
    expect(String(tableSql.rows[0]?.sql)).toBe(String(beforeSql.rows[0]?.sql))
    const index = await after.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'sponsorships_status_idx'",
    )
    expect(index.rows).toHaveLength(1)
    const kept = await after.execute({
      sql: 'SELECT company, status FROM sponsorships WHERE stripe_checkout_session_id = ?',
      args: ['cs_test_stray_preview'],
    })
    expect(kept.rows).toEqual([{ company: 'Stray Preview Co', status: 'pending' }])
    after.close()

    await applyMigrations(url)
    const again = createClient({ url })
    const count = await again.execute('SELECT COUNT(*) AS n FROM schema_migrations')
    expect(Number(count.rows[0]?.n)).toBe(MAIN_MIGRATIONS.length + 2)
    const stillThere = await again.execute({
      sql: "SELECT id FROM schema_migrations WHERE id = '0005_sponsorships.sql'",
    })
    expect(stillThere.rows).toHaveLength(1)
    const appliedAt = await again.execute(
      "SELECT applied_at FROM schema_migrations WHERE id = '0005_sponsorships.sql'",
    )
    expect(Number(appliedAt.rows[0]?.applied_at)).toBe(Number(beforeLedger.rows[0]?.applied_at))
    const rowCount = await again.execute('SELECT COUNT(*) AS n FROM sponsorships')
    expect(Number(rowCount.rows[0]?.n)).toBe(Number(beforeRows.rows[0]?.n))
    again.close()
  })

  it('adds missing sponsorship columns and the status index without deleting the stray ledger row', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-adopt-0005-'))
    directories.push(root)
    const url = `file:${path.join(root, 'adopt.db')}`
    const client = createClient({ url })
    for (const file of MAIN_MIGRATIONS) {
      const sql = await readFile(path.join(process.cwd(), 'drizzle', file), 'utf8')
      await client.executeMultiple(sql)
      await client.execute({
        sql: 'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
        args: [file, 1],
      })
    }
    await client.execute(`
      CREATE TABLE sponsorships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stripe_checkout_session_id TEXT NOT NULL UNIQUE,
        offering TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
    await client.execute({
      sql: 'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
      args: ['0005_sponsorships.sql', 1_762_000_000_000],
    })
    await client.execute({
      sql: `INSERT INTO sponsorships (
        stripe_checkout_session_id, offering, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)`,
      args: ['cs_test_partial', 'placement_weekly', 'paid', 2, 2],
    })
    client.close()

    await applyMigrations(url)

    const after = createClient({ url })
    const columns = await after.execute('PRAGMA table_info(sponsorships)')
    expect(columns.rows.map((row) => String(row.name))).toEqual(
      expect.arrayContaining([
        'id',
        'stripe_checkout_session_id',
        'stripe_payment_intent_id',
        'stripe_customer_id',
        'stripe_price_id',
        'offering',
        'status',
        'email',
        'company',
        'task_slug',
        'issue_date',
        'amount_total',
        'currency',
        'created_at',
        'updated_at',
      ]),
    )
    const index = await after.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'sponsorships_status_idx'",
    )
    expect(index.rows).toHaveLength(1)
    const kept = await after.execute({
      sql: 'SELECT status FROM sponsorships WHERE stripe_checkout_session_id = ?',
      args: ['cs_test_partial'],
    })
    expect(kept.rows.map((row) => String(row.status))).toEqual(['paid'])
    const stray = await after.execute(
      "SELECT id FROM schema_migrations WHERE id = '0005_sponsorships.sql'",
    )
    expect(stray.rows).toHaveLength(1)
    const recorded = await after.execute(
      "SELECT id FROM schema_migrations WHERE id = '0009_sponsorships.sql'",
    )
    expect(recorded.rows).toHaveLength(1)
    after.close()
  })
})

import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
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
    expect(ids).toContain('0009_sponsorships.sql')
    expect(ids).toContain('0012_result_rate_windows.sql')
    expect(ids).toContain('0013_sponsorship_paid_at.sql')
    expect(ids).toContain('0014_sponsorship_creatives.sql')
    expect(ids).toContain('0015_sponsorship_slot_claims.sql')
    expect(ids).toContain('0016_sponsorship_card_review.sql')
    expect(ids).toContain('0017_sponsorship_daily_counts.sql')
    expect(ids).toContain('0018_retention_indexes.sql')
    expect(ids).not.toContain('0010_result_rate_windows.sql')
    const windows = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'result_rate_windows'",
    )
    expect(windows.rows).toHaveLength(1)
    const retentionIndexes = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('rate_limits_reset_at_idx', 'clicks_ts_idx') ORDER BY name",
    )
    expect(retentionIndexes.rows.map((row) => String(row.name))).toEqual(['clicks_ts_idx', 'rate_limits_reset_at_idx'])
    expect(ids).toContain('0011_user_reviews.sql')
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
      '0011_user_reviews.sql',
      '0012_result_rate_windows.sql',
      '0013_sponsorship_paid_at.sql',
      '0014_sponsorship_creatives.sql',
      '0015_sponsorship_slot_claims.sql',
      '0016_sponsorship_card_review.sql',
      '0017_sponsorship_daily_counts.sql',
      '0018_retention_indexes.sql',
      '0019_subscriber_status.sql',
      '0020_subscriber_syncing_started.sql',
      '0021_subscriber_beehiiv_status.sql',
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
      'paid_at',
      'refunded_at',
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
      '0011_user_reviews.sql',
      '0012_result_rate_windows.sql',
      '0013_sponsorship_paid_at.sql',
      '0014_sponsorship_creatives.sql',
      '0015_sponsorship_slot_claims.sql',
      '0016_sponsorship_card_review.sql',
      '0017_sponsorship_daily_counts.sql',
      '0018_retention_indexes.sql',
      '0019_subscriber_status.sql',
      '0020_subscriber_syncing_started.sql',
      '0021_subscriber_beehiiv_status.sql',
    ])
    const columns = await after.execute('PRAGMA table_info(sponsorships)')
    const beforeCols = before.rows.map((row) => ({
      name: String(row.name),
      type: String(row.type),
      notnull: Number(row.notnull),
      pk: Number(row.pk),
    }))
    const afterCols = columns.rows.map((row) => ({
      name: String(row.name),
      type: String(row.type),
      notnull: Number(row.notnull),
      pk: Number(row.pk),
    }))
    expect(afterCols.slice(0, beforeCols.length)).toEqual(beforeCols)
    expect(afterCols.slice(beforeCols.length)).toEqual([
      { name: 'paid_at', type: 'INTEGER', notnull: 0, pk: 0 },
      { name: 'refunded_at', type: 'INTEGER', notnull: 0, pk: 0 },
    ])
    const tableSql = await after.execute(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sponsorships'",
    )
    const afterSql = String(tableSql.rows[0]?.sql)
    expect(String(beforeSql.rows[0]?.sql)).toContain("CHECK (status IN ('pending', 'paid', 'failed'))")
    expect(afterSql).toContain("CHECK (status IN ('pending', 'paid', 'failed'))")
    expect(afterSql).toContain('paid_at')
    expect(afterSql).toContain('refunded_at')
    expect(afterSql.toLowerCase()).not.toContain('drop')
    const index = await after.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'sponsorships_status_idx'",
    )
    expect(index.rows).toHaveLength(1)
    const kept = await after.execute({
      sql: 'SELECT company, status, paid_at, refunded_at FROM sponsorships WHERE stripe_checkout_session_id = ?',
      args: ['cs_test_stray_preview'],
    })
    expect(kept.rows).toEqual([{ company: 'Stray Preview Co', status: 'pending', paid_at: null, refunded_at: null }])
    after.close()

    await applyMigrations(url)
    const again = createClient({ url })
    const count = await again.execute('SELECT COUNT(*) AS n FROM schema_migrations')
    expect(Number(count.rows[0]?.n)).toBe(MAIN_MIGRATIONS.length + 13)
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
        'paid_at',
        'refunded_at',
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
    const stamped = await after.execute({
      sql: 'SELECT paid_at, refunded_at FROM sponsorships WHERE stripe_checkout_session_id = ?',
      args: ['cs_test_partial'],
    })
    expect(stamped.rows).toEqual([{ paid_at: 2, refunded_at: null }])
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

  it('applies 0018 with 0009 already on disk, then applies later sponsor files when they land', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-order-'))
    directories.push(root)
    const sqlDir = path.join(root, 'drizzle')
    await mkdir(sqlDir)
    const source = path.join(process.cwd(), 'drizzle')
    for (const name of await readdir(source)) {
      if (!name.endsWith('.sql')) continue
      await copyFile(path.join(source, name), path.join(sqlDir, name))
    }
    const url = `file:${path.join(root, 'order.db')}`
    await applyMigrations(url, undefined, sqlDir)

    const reserved = [
      '0009_sponsorships.sql',
      '0013_sponsorship_paid_at.sql',
      '0014_sponsorship_creatives.sql',
      '0015_sponsorship_slot_claims.sql',
      '0016_sponsorship_card_review.sql',
      '0017_sponsorship_daily_counts.sql',
    ]
    const onDisk = new Set((await readdir(sqlDir)).filter((name) => name.endsWith('.sql')))
    const present = reserved.filter((name) => onDisk.has(name))
    const late = reserved.filter((name) => !onDisk.has(name))
    const client = createClient({ url })
    const first = await client.execute('SELECT id FROM schema_migrations ORDER BY id')
    const firstIds = first.rows.map((row) => String(row.id))
    expect(firstIds).toContain('0018_retention_indexes.sql')
    expect(firstIds).toContain('0011_user_reviews.sql')
    expect(firstIds).toContain('0012_result_rate_windows.sql')
    expect(present).toContain('0009_sponsorships.sql')
    for (const name of present) expect(firstIds).toContain(name)
    for (const name of late) expect(firstIds).not.toContain(name)
    const indexes = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('rate_limits_reset_at_idx', 'clicks_ts_idx') ORDER BY name",
    )
    expect(indexes.rows.map((row) => String(row.name))).toEqual(['clicks_ts_idx', 'rate_limits_reset_at_idx'])
    client.close()

    for (const name of late) {
      const table = `late_${name.slice(0, 4)}`
      await writeFile(path.join(sqlDir, name), `CREATE TABLE IF NOT EXISTS ${table} (id INTEGER PRIMARY KEY);\n`)
    }
    await applyMigrations(url, undefined, sqlDir)

    const again = createClient({ url })
    const second = await again.execute('SELECT id, COUNT(*) AS n FROM schema_migrations GROUP BY id')
    const counts = new Map(second.rows.map((row) => [String(row.id), Number(row.n)]))
    expect(counts.get('0018_retention_indexes.sql')).toBe(1)
    for (const name of present) expect(counts.get(name)).toBe(1)
    for (const name of late) expect(counts.get(name)).toBe(1)
    for (const name of late) {
      const table = `late_${name.slice(0, 4)}`
      const created = await again.execute({
        sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        args: [table],
      })
      expect(created.rows).toHaveLength(1)
    }
    const still = await again.execute(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'clicks_ts_idx'",
    )
    expect(still.rows).toHaveLength(1)
    again.close()

    await applyMigrations(url, undefined, sqlDir)
    const third = createClient({ url })
    const finalCount = await third.execute('SELECT COUNT(*) AS n FROM schema_migrations')
    expect(Number(finalCount.rows[0]?.n)).toBe(firstIds.length + late.length)
    third.close()
  })
})

describe('drizzle journal', () => {
  it('gives every migration file on disk one increasing idx', async () => {
    const journal = JSON.parse(await readFile(path.join(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[]
    }
    const sqlFiles = (await readdir(path.join(process.cwd(), 'drizzle'))).filter((name) => name.endsWith('.sql')).sort()
    const tagsFromFiles = sqlFiles.map((name) => name.slice(0, -'.sql'.length))
    const tags = journal.entries.map((entry) => entry.tag)
    const idxs = journal.entries.map((entry) => entry.idx)
    expect(new Set(tags).size).toBe(tags.length)
    expect(new Set(idxs).size).toBe(idxs.length)
    for (let index = 1; index < idxs.length; index += 1) {
      expect(idxs[index]).toBeGreaterThan(idxs[index - 1] ?? -1)
    }
    // 0009_sponsorships.sql is on disk, so that journal row is not a placeholder.
    // Tags equal the SQL files, in idx order. Dropping 0018_retention_indexes fails here.
    expect(tags).toEqual(tagsFromFiles)
    expect(sqlFiles).not.toContain('0010_result_rate_windows.sql')
    const idxOf = (tag: string) => journal.entries.find((entry) => entry.tag === tag)?.idx
    expect(idxOf('0009_sponsorships')).toBe(8)
    expect(idxOf('0011_user_reviews')).toBe(9)
    expect(idxOf('0012_result_rate_windows')).toBe(10)
    expect(idxOf('0013_sponsorship_paid_at')).toBe(11)
    expect(idxOf('0014_sponsorship_creatives')).toBe(12)
    expect(idxOf('0015_sponsorship_slot_claims')).toBe(13)
    expect(idxOf('0016_sponsorship_card_review')).toBe(14)
    expect(idxOf('0017_sponsorship_daily_counts')).toBe(15)
    expect(idxOf('0018_retention_indexes')).toBe(16)
    expect(idxOf('0019_subscriber_status')).toBe(17)
    expect(idxOf('0020_subscriber_syncing_started')).toBe(18)
    expect(idxOf('0021_subscriber_beehiiv_status')).toBe(19)
    const migration = await readFile(path.join(process.cwd(), 'drizzle/0013_sponsorship_paid_at.sql'), 'utf8')
    const executable = executableSql(migration).toLowerCase()
    expect(executable).not.toContain('add column if not exists')
    expect(executable).not.toContain('drop')
    expect(executable).not.toContain('delete')
    expect(executable).toContain('create index if not exists sponsorships_status_idx')
    const creatives = executableSql(
      await readFile(path.join(process.cwd(), 'drizzle/0014_sponsorship_creatives.sql'), 'utf8'),
    ).toLowerCase()
    expect(creatives).not.toContain('add column if not exists')
    expect(creatives).not.toContain('drop')
    expect(creatives).not.toContain('delete from')
    expect(creatives).toContain('before delete on')
    expect(creatives).toContain('create table if not exists sponsorship_creatives')
    expect(creatives).toContain('create table if not exists sponsorship_review_events')
    const claims = executableSql(
      await readFile(path.join(process.cwd(), 'drizzle/0015_sponsorship_slot_claims.sql'), 'utf8'),
    ).toLowerCase()
    expect(claims).not.toContain('add column if not exists')
    expect(claims).not.toContain('drop')
    expect(claims).not.toContain('delete')
    expect(claims).toContain('create table if not exists sponsorship_slot_claims')
    const review = executableSql(
      await readFile(path.join(process.cwd(), 'drizzle/0016_sponsorship_card_review.sql'), 'utf8'),
    ).toLowerCase()
    expect(review).not.toContain('add column if not exists')
    expect(review).not.toContain('drop')
    expect(review).not.toContain('delete from')
    expect(review).toContain('before delete on')
    expect(review).toContain('create table if not exists sponsorship_refund_events')
    expect(review).not.toContain('ip_hash')
    expect(review).not.toContain('user_agent')
    const daily = executableSql(
      await readFile(path.join(process.cwd(), 'drizzle/0017_sponsorship_daily_counts.sql'), 'utf8'),
    ).toLowerCase()
    expect(daily).not.toContain('add column if not exists')
    expect(daily).not.toContain('drop')
    expect(daily).not.toContain('delete')
    expect(daily).toContain('create table if not exists sponsorship_daily_counts')
    expect(daily).not.toContain('ip_hash')
    expect(daily).not.toContain('user_agent')
    expect(daily).not.toContain('cookie')
    expect(daily).not.toContain('user_id')
    expect(sqlFiles).not.toContain('0013_retention_indexes.sql')
    expect(sqlFiles).not.toContain('0016_retention_indexes.sql')
  })
})

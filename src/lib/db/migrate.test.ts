import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, describe, expect, it } from 'vitest'
import { applyMigrations, ensureSqliteDirectory, sqliteFilePath } from './migrate'

const directories: string[] = []

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
    expect(ids).toContain('0012_result_rate_windows.sql')
    expect(ids).not.toContain('0010_result_rate_windows.sql')
    const windows = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'result_rate_windows'",
    )
    expect(windows.rows).toHaveLength(1)
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
})

describe('drizzle journal', () => {
  it('keeps one idx per migration once sponsorships, reviews, and the result window are together', async () => {
    const journal = JSON.parse(await readFile(path.join(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8')) as {
      entries: { idx: number; tag: string }[]
    }
    const tags = journal.entries.map((entry) => entry.tag)
    const idxs = journal.entries.map((entry) => entry.idx)
    // Filename order after #10 (0009), #32 (0011), and this PR (0012) all land.
    // 0010 is unused so this migration does not sort between those two.
    expect(tags).toEqual([
      '0001_init',
      '0002_catalog_indexes',
      '0003_tool_tasks_unique',
      '0004_retire_quiz_fits',
      '0005_tool_scores_pros_cons',
      '0006_tool_needs_verification',
      '0007_drop_non_forge_scores',
      '0008_ratings_v23',
      '0009_sponsorships',
      '0011_user_reviews',
      '0012_result_rate_windows',
    ])
    expect(idxs).toEqual(tags.map((_, index) => index))
    expect(new Set(idxs).size).toBe(idxs.length)
    expect(journal.entries.find((entry) => entry.tag === '0009_sponsorships')?.idx).toBe(8)
    expect(journal.entries.find((entry) => entry.tag === '0011_user_reviews')?.idx).toBe(9)
    expect(journal.entries.find((entry) => entry.tag === '0012_result_rate_windows')?.idx).toBe(10)

    const sqlFiles = (await readdir(path.join(process.cwd(), 'drizzle'))).filter((name) => name.endsWith('.sql')).sort()
    const arrivingWithOtherPrs = new Set(['0009_sponsorships.sql', '0011_user_reviews.sql'])
    expect(sqlFiles).toEqual(tags.map((tag) => `${tag}.sql`).filter((name) => !arrivingWithOtherPrs.has(name)))
    expect(sqlFiles).toContain('0012_result_rate_windows.sql')
    expect(sqlFiles).not.toContain('0010_result_rate_windows.sql')
  })
})

import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
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

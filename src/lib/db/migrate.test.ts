import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
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
})

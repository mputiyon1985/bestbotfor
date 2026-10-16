import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Client } from '@libsql/client'
import { createTestDatabase } from '@/test/db'
import { cachedTaskSlugs, clearTaskSlugCache, getDb, resetDbCache } from './client'
import { tasks } from './schema'

const previousUrl = process.env.TURSO_DATABASE_URL
const previousToken = process.env.TURSO_AUTH_TOKEN

afterEach(() => {
  resetDbCache()
  if (previousUrl === undefined) delete process.env.TURSO_DATABASE_URL
  else process.env.TURSO_DATABASE_URL = previousUrl
  if (previousToken === undefined) delete process.env.TURSO_AUTH_TOKEN
  else process.env.TURSO_AUTH_TOKEN = previousToken
})

describe('database client', () => {
  it('reuses one libsql client for the process', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'bestbotfor-client-'))
    process.env.TURSO_DATABASE_URL = `file:${path.join(directory, 'reuse.db')}`
    process.env.TURSO_AUTH_TOKEN = 'local'
    resetDbCache()
    try {
      const first = getDb()
      const second = getDb()
      expect(second).toBe(first)
      expect(second.$client).toBe(first.$client)
    } finally {
      getDb().$client.close()
      resetDbCache()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('loads task slugs once and shares that set across concurrent reads', async () => {
    const { db, close } = await createTestDatabase()
    try {
      await db.insert(tasks).values({ slug: 'chat', name: 'Chat', category: 'General', description: 'Talk.' })
      const execute = db.$client.execute.bind(db.$client)
      let queries = 0
      db.$client.execute = (async (...args: Parameters<Client['execute']>) => {
        queries += 1
        await new Promise((resolve) => setTimeout(resolve, 40))
        return execute(...args)
      }) as Client['execute']

      const sets = await Promise.all(Array.from({ length: 8 }, () => cachedTaskSlugs(db)))
      expect(sets.every((set) => set.has('chat'))).toBe(true)
      expect(new Set(sets).size).toBe(1)
      expect(queries).toBe(1)

      const again = await cachedTaskSlugs(db)
      expect(again).toBe(sets[0])
      expect(queries).toBe(1)

      await db.insert(tasks).values({ slug: 'code', name: 'Code', category: 'General', description: 'Write.' })
      expect((await cachedTaskSlugs(db)).has('code')).toBe(false)
      clearTaskSlugCache(db)
      expect((await cachedTaskSlugs(db)).has('code')).toBe(true)
    } finally {
      await close()
    }
  })
})

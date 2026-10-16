import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from './schema'

export type Database = LibSQLDatabase<typeof schema> & { $client: Client }

const globalForDb = globalThis as unknown as { bestbotforDb?: Database; bestbotforClient?: Client }

/**
 * Module binding so a warm process keeps one client. globalThis survives a
 * dev reload that re-executes this file. Concurrent requests share it.
 */
let cachedDb: Database | undefined

const taskSlugCache = new WeakMap<Database, ReadonlySet<string>>()
const taskSlugInflight = new WeakMap<Database, Promise<ReadonlySet<string>>>()

export function databaseUrl(): string {
  const url = process.env.TURSO_DATABASE_URL?.trim()
  if (!url) throw new Error('TURSO_DATABASE_URL is not set')
  return url
}

export function createLibsqlClient(url = databaseUrl()): Client {
  const fileDatabase = url.startsWith('file:')
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim()
  if (!fileDatabase && !authToken) throw new Error('TURSO_AUTH_TOKEN is not set')
  return createClient({ url, authToken: fileDatabase ? undefined : authToken })
}

export function getDb(): Database {
  if (cachedDb) return cachedDb
  if (globalForDb.bestbotforDb) {
    cachedDb = globalForDb.bestbotforDb
    return cachedDb
  }
  const client = createLibsqlClient()
  const db = drizzle(client, { schema })
  cachedDb = db
  globalForDb.bestbotforClient = client
  globalForDb.bestbotforDb = db
  return db
}

/**
 * Task slugs change on deploy, not per request. One shared read fills the set.
 * Later quiz checks, including a burst, do not open another catalog query.
 */
export async function cachedTaskSlugs(db: Database): Promise<ReadonlySet<string>> {
  const cached = taskSlugCache.get(db)
  if (cached) return cached
  const inflight = taskSlugInflight.get(db)
  if (inflight) return inflight
  const promise = loadTaskSlugs(db)
  taskSlugInflight.set(db, promise)
  try {
    return await promise
  } finally {
    if (taskSlugInflight.get(db) === promise) taskSlugInflight.delete(db)
  }
}

async function loadTaskSlugs(db: Database): Promise<ReadonlySet<string>> {
  const rows = await db.select({ slug: schema.tasks.slug }).from(schema.tasks)
  const slugs = new Set(rows.map((row) => row.slug))
  taskSlugCache.set(db, slugs)
  return slugs
}

export function clearTaskSlugCache(db: Database): void {
  taskSlugCache.delete(db)
  taskSlugInflight.delete(db)
}

export function resetDbCache(): void {
  if (globalForDb.bestbotforDb) clearTaskSlugCache(globalForDb.bestbotforDb)
  if (cachedDb) clearTaskSlugCache(cachedDb)
  cachedDb = undefined
  globalForDb.bestbotforDb = undefined
  globalForDb.bestbotforClient = undefined
}

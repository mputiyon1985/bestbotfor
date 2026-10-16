import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from './schema'

export type Database = LibSQLDatabase<typeof schema> & { $client: Client }

const globalForDb = globalThis as unknown as {
  bestbotforDb?: Database
  bestbotforClient?: Client
  bestbotforFileUrl?: string
  bestbotforLimiterClient?: Client
}

/**
 * Module binding so a warm process keeps one client. globalThis survives a
 * dev reload that re-executes this file. Concurrent requests share it.
 */
let cachedDb: Database | undefined

/** Slugs change with a deploy or a seed, not per request. Five minutes is enough to skip a second catalog read. */
export const TASK_SLUG_CACHE_TTL_MS = 5 * 60 * 1000

type TaskSlugEntry = { slugs: ReadonlySet<string>; expiresAt: number }

const taskSlugCache = new WeakMap<Database, TaskSlugEntry>()
const taskSlugInflight = new WeakMap<Database, Promise<ReadonlySet<string>>>()

export function databaseUrl(): string {
  const url = process.env.TURSO_DATABASE_URL?.trim()
  if (!url) throw new Error('TURSO_DATABASE_URL is not set')
  return url
}

const clientUrls = new WeakMap<Client, string>()

export function createLibsqlClient(url = databaseUrl()): Client {
  const fileDatabase = url.startsWith('file:')
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim()
  if (!fileDatabase && !authToken) throw new Error('TURSO_AUTH_TOKEN is not set')
  const client = createClient({ url, authToken: fileDatabase ? undefined : authToken })
  clientUrls.set(client, url)
  if (fileDatabase) globalForDb.bestbotforFileUrl = url
  return client
}

const fileSharing = new WeakMap<Client, Promise<void>>()
const dedicatedFileClients = new WeakMap<Client, Client>()

/**
 * Local files are opened by more than one server process in tests.
 * WAL lets the other process read while one writes. busy_timeout is shorter
 * than the limiter budget, so a lock returns and can be retried instead of
 * holding a write that the deadline already gave up on.
 * Hosted Turso has no local journal, so remote clients skip these pragmas.
 */
export function configureFileDatabase(client: Client): Promise<void> {
  const url = clientUrls.get(client) ?? globalForDb.bestbotforFileUrl
  if (url && !url.startsWith('file:')) return Promise.resolve()
  const existing = fileSharing.get(client)
  if (existing) return existing
  const pending = (async () => {
    try {
      await client.execute('PRAGMA busy_timeout = 100')
      const mode = await client.execute('PRAGMA journal_mode')
      const current = String(mode.rows[0]?.journal_mode ?? '').toLowerCase()
      if (current !== 'wal') await client.execute('PRAGMA journal_mode = WAL')
    } catch (error) {
      fileSharing.delete(client)
      throw error
    }
  })()
  fileSharing.set(client, pending)
  return pending
}

/**
 * A second connection for file databases. The request connection also serves
 * catalog reads, and those statements would queue the limiter write on the
 * same connection. Hosted Turso uses the request connection.
 */
export function limiterClientFor(client: Client): Client {
  const url = clientUrls.get(client) ?? globalForDb.bestbotforFileUrl
  if (!url?.startsWith('file:')) return client
  const existing = dedicatedFileClients.get(client) ?? globalForDb.bestbotforLimiterClient
  if (existing) return existing
  const dedicated = createClient({ url })
  clientUrls.set(dedicated, url)
  dedicatedFileClients.set(client, dedicated)
  globalForDb.bestbotforLimiterClient = dedicated
  return dedicated
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

/** The set when it is still inside the TTL, otherwise null. Does not query. */
export function peekCachedTaskSlugs(db: Database, now = Date.now()): ReadonlySet<string> | null {
  const cached = taskSlugCache.get(db)
  if (!cached || cached.expiresAt <= now) return null
  return cached.slugs
}

/**
 * One shared read fills the set. Later quiz checks, including a burst, do not
 * open another catalog query until the TTL passes.
 */
export async function cachedTaskSlugs(db: Database, now = Date.now()): Promise<ReadonlySet<string>> {
  const cached = peekCachedTaskSlugs(db, now)
  if (cached) return cached
  const inflight = taskSlugInflight.get(db)
  if (inflight) return inflight
  const promise = loadTaskSlugs(db, now)
  taskSlugInflight.set(db, promise)
  try {
    return await promise
  } finally {
    if (taskSlugInflight.get(db) === promise) taskSlugInflight.delete(db)
  }
}

async function loadTaskSlugs(db: Database, now: number): Promise<ReadonlySet<string>> {
  const rows = await db.select({ slug: schema.tasks.slug }).from(schema.tasks)
  const slugs = new Set(rows.map((row) => row.slug))
  taskSlugCache.set(db, { slugs, expiresAt: now + TASK_SLUG_CACHE_TTL_MS })
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

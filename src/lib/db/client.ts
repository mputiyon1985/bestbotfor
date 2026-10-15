import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from './schema'

export type Database = LibSQLDatabase<typeof schema> & { $client: Client }

const globalForDb = globalThis as unknown as { bestbotforDb?: Database; bestbotforClient?: Client }

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
  if (globalForDb.bestbotforDb) return globalForDb.bestbotforDb
  const client = createLibsqlClient()
  const db = drizzle(client, { schema })
  globalForDb.bestbotforClient = client
  globalForDb.bestbotforDb = db
  return db
}

export function resetDbCache(): void {
  globalForDb.bestbotforDb = undefined
  globalForDb.bestbotforClient = undefined
}

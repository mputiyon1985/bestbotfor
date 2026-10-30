import 'server-only'
import { createClient } from '@libsql/client'
import { normalizeEmail, toIso } from '../format'
import { MAX_SIGNUPS, unavailable, type Signup, type SourceResult } from '../types'

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

export type SubscriberQueryEnv = {
  SIGNUPS_TURSO_TABLE?: string
  SIGNUPS_TURSO_EMAIL_COLUMN?: string
  SIGNUPS_TURSO_CREATED_COLUMN?: string
}

/**
 * One read-only query against the signups database, not the site database.
 * Defaults match email and created_at on subscribers. Only bare identifiers
 * are accepted. Anything else falls back to the default.
 */
export function subscriberQuery(env?: SubscriberQueryEnv): string {
  const source = env ?? {
    SIGNUPS_TURSO_TABLE: process.env.SIGNUPS_TURSO_TABLE,
    SIGNUPS_TURSO_EMAIL_COLUMN: process.env.SIGNUPS_TURSO_EMAIL_COLUMN,
    SIGNUPS_TURSO_CREATED_COLUMN: process.env.SIGNUPS_TURSO_CREATED_COLUMN,
  }
  const table = identifier(source.SIGNUPS_TURSO_TABLE, 'subscribers')
  const email = identifier(source.SIGNUPS_TURSO_EMAIL_COLUMN, 'email')
  const created = identifier(source.SIGNUPS_TURSO_CREATED_COLUMN, 'created_at')
  return `SELECT "${email}" AS email, "${created}" AS created_at FROM "${table}" ORDER BY "${created}" DESC LIMIT ${MAX_SIGNUPS}`
}

function identifier(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  if (trimmed && IDENTIFIER.test(trimmed)) return trimmed
  return fallback
}

function logFailure(): void {
  console.error('source unavailable: turso')
}

export async function fetchTursoSignups(): Promise<SourceResult> {
  const url = process.env.SIGNUPS_TURSO_DATABASE_URL?.trim() ?? ''
  const authToken = process.env.SIGNUPS_TURSO_AUTH_TOKEN?.trim() ?? ''
  if (!url || !authToken) return unavailable('turso')

  const sql = subscriberQuery()
  if (sql.includes(';') || !sql.startsWith('SELECT ')) {
    logFailure()
    return unavailable('turso')
  }

  let client: ReturnType<typeof createClient> | undefined
  try {
    client = createClient({ url, authToken })
    const result = await client.execute(sql)
    const signups: Signup[] = []
    for (const row of result.rows) {
      const record = row as unknown as Record<string, unknown>
      const email = normalizeEmail(record.email)
      const createdAt = toIso(record.created_at)
      if (!email || !createdAt) continue
      signups.push({ source: 'turso', email, createdAt })
      if (signups.length >= MAX_SIGNUPS) break
    }
    return {
      source: 'turso',
      ok: true,
      signups,
      total: signups.length,
      capped: signups.length >= MAX_SIGNUPS,
    }
  } catch {
    logFailure()
    return unavailable('turso')
  } finally {
    try {
      client?.close()
    } catch {
      // Closing a failed client must not mask the source result.
    }
  }
}

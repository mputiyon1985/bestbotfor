import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LightbulbIcon } from '@/components/lightbulb-icon'
import { BRAND } from '@/lib/brand'
import { SUGGESTIONS_DDL, adoptSuggestionsSchema } from '@/lib/db/migrate'
import { suggestions } from '@/lib/db/schema'
import { SUGGESTION_PRIVACY_PARAGRAPH } from '@/lib/privacy-copy'
import { notifySuggestion, SUGGESTION_NOTIFY_EMAIL } from '@/lib/suggestion-mail'
import { resetSuggestionRates, SUGGESTION_RATE_LIMIT } from '@/lib/suggestion-rate'
import { SUGGESTION_SUCCESS, submitSuggestion } from '@/lib/suggestions'
import { createTestDatabase } from '@/test/db'
import { eq } from 'drizzle-orm'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

beforeEach(() => {
  resetSuggestionRates()
})

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), 'utf8')
}

describe('suggestions', () => {
  it('stores a note with an optional email and sends the no-op notice once', async () => {
    const test = await createTestDatabase()
    const notify = vi.fn(notifySuggestion)
    const result = await submitSuggestion({
      kind: 'add',
      message: '  Add a writing comparison.  ',
      email: 'reader@example.com',
      honeypot: '',
      db: test.db,
      rateKey: 'hash-one',
      now: 1_700_000_000_000,
      notify,
    })
    expect(result).toEqual({ status: 'success', message: SUGGESTION_SUCCESS })
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.results[0]?.value).toEqual({
      sent: false,
      reason: 'no-mail-transport',
      to: SUGGESTION_NOTIFY_EMAIL,
    })
    const rows = await test.db.select().from(suggestions)
    expect(rows).toEqual([
      {
        id: 1,
        kind: 'add',
        message: 'Add a writing comparison.',
        email: 'reader@example.com',
        createdAt: 1_700_000_000_000,
      },
    ])
    const columns = await test.db.$client.execute('PRAGMA table_info(suggestions)')
    expect(columns.rows.map((row) => String(row.name))).toEqual(['id', 'kind', 'message', 'email', 'created_at'])
    expect(JSON.stringify(rows)).not.toContain('hash-one')
    const limits = await test.db.$client.execute('SELECT COUNT(*) AS n FROM rate_limits')
    expect(Number(limits.rows[0]?.n)).toBe(0)
    await test.close()
  })

  it('stores a null email when the field is blank', async () => {
    const test = await createTestDatabase()
    const result = await submitSuggestion({
      kind: 'like',
      message: 'The picker is fast.',
      email: '   ',
      honeypot: '',
      db: test.db,
      rateKey: 'hash-blank-email',
      now: 10,
    })
    expect(result.status).toBe('success')
    const rows = await test.db.select().from(suggestions).where(eq(suggestions.kind, 'like'))
    expect(rows[0]?.email).toBeNull()
    await test.close()
  })

  it('rejects a long message, a bad type, and a bad email without writing', async () => {
    const test = await createTestDatabase()
    const long = await submitSuggestion({
      kind: 'remove',
      message: 'a'.repeat(2001),
      email: '',
      honeypot: '',
      db: test.db,
      rateKey: 'hash-invalid',
      now: 10,
    })
    const kind = await submitSuggestion({
      kind: 'other',
      message: 'Hello',
      email: '',
      honeypot: '',
      db: test.db,
      rateKey: 'hash-invalid',
      now: 11,
    })
    const email = await submitSuggestion({
      kind: 'like',
      message: 'Hello',
      email: 'not-an-email',
      honeypot: '',
      db: test.db,
      rateKey: 'hash-invalid',
      now: 12,
    })
    expect(long).toEqual({ status: 'error', message: 'Keep the message under 2000 characters.' })
    expect(kind).toEqual({ status: 'error', message: 'Choose like, add, or remove.' })
    expect(email).toEqual({ status: 'error', message: 'Enter a valid email address.' })
    const rows = await test.db.select().from(suggestions)
    expect(rows).toEqual([])
    await test.close()
  })

  it('accepts 2000 characters and treats a honeypot as success with no row and no notice', async () => {
    const test = await createTestDatabase()
    const notify = vi.fn(notifySuggestion)
    const stored = await submitSuggestion({
      kind: 'remove',
      message: 'b'.repeat(2000),
      email: '',
      honeypot: '',
      db: test.db,
      rateKey: 'hash-length',
      now: 20,
      notify,
    })
    const honeypot = await submitSuggestion({
      kind: 'add',
      message: 'spam',
      email: 'spam@example.com',
      honeypot: 'https://spam.example',
      db: test.db,
      rateKey: 'hash-honey',
      now: 21,
      notify,
    })
    expect(stored.status).toBe('success')
    expect(honeypot).toEqual({ status: 'success', message: SUGGESTION_SUCCESS })
    expect(notify).toHaveBeenCalledTimes(1)
    const rows = await test.db.select().from(suggestions)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.message).toHaveLength(2000)
    expect(rows[0]?.email).toBeNull()
    await test.close()
  })

  it('stops after the in-memory limit and does not store the key', async () => {
    const test = await createTestDatabase()
    const rateKey = '203.0.113.9'
    for (let index = 0; index < SUGGESTION_RATE_LIMIT; index += 1) {
      const result = await submitSuggestion({
        kind: 'like',
        message: `Note ${index}`,
        email: '',
        honeypot: '',
        db: test.db,
        rateKey,
        now: 100 + index,
      })
      expect(result.status).toBe('success')
    }
    const blocked = await submitSuggestion({
      kind: 'like',
      message: 'One more',
      email: '',
      honeypot: '',
      db: test.db,
      rateKey,
      now: 200,
    })
    expect(blocked).toEqual({ status: 'error', message: 'Too many suggestions. Try again in an hour.' })
    const rows = await test.db.select().from(suggestions)
    expect(rows).toHaveLength(SUGGESTION_RATE_LIMIT)
    expect(JSON.stringify(rows)).not.toContain(rateKey)
    const limits = await test.db.$client.execute('SELECT COUNT(*) AS n FROM rate_limits')
    expect(Number(limits.rows[0]?.n)).toBe(0)
    await test.close()
  })

  it('adds a missing email column and keeps the existing row', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bestbotfor-suggestions-'))
    directories.push(root)
    const client = createClient({ url: `file:${path.join(root, 'partial.db')}` })
    await client.execute(`CREATE TABLE suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`)
    await client.execute({
      sql: 'INSERT INTO suggestions (kind, message, created_at) VALUES (?, ?, ?)',
      args: ['like', 'keep this', 4],
    })
    await adoptSuggestionsSchema(client)
    const columns = await client.execute('PRAGMA table_info(suggestions)')
    expect(columns.rows.map((row) => String(row.name))).toEqual(['id', 'kind', 'message', 'created_at', 'email'])
    const kept = await client.execute('SELECT kind, message, email FROM suggestions')
    expect(kept.rows).toEqual([{ kind: 'like', message: 'keep this', email: null }])
    client.close()
  })

  it('keeps the SQL file identical to the adopt DDL and off the public surface', () => {
    const sql = readFileSync(path.join(process.cwd(), 'drizzle/0022_suggestions.sql'), 'utf8')
    const executable = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim()
    expect(executable).toBe(SUGGESTIONS_DDL.trim())
    expect(executable.toLowerCase()).not.toContain('drop')
    expect(executable.toLowerCase()).not.toContain('delete')
    expect(executable.toLowerCase()).not.toContain('ip')
    expect(existsSync(path.join(process.cwd(), 'src/app/api/suggestions/route.ts'))).toBe(false)
    expect(existsSync(path.join(process.cwd(), 'src/app/admin/suggestions/page.tsx'))).toBe(false)
    const action = source('src/app/suggest/actions.ts')
    expect(action).toContain("rateLimitKey(clientIp(headerStore), 'suggestion')")
    expect(source('src/lib/suggestions.ts')).not.toContain('clientIp')
    expect(source('src/lib/suggestions.ts')).not.toContain('rate_limits')
    expect(source('src/app/layout.tsx')).toContain('<SuggestSomethingLink')
    expect(source('src/app/layout.tsx')).toContain('<SuggestionDialog')
    expect(source('src/components/site-footer.tsx')).toContain('<SuggestSomethingLink')
    const page = source('src/app/privacy/page.tsx')
    expect(page).toContain('SUGGESTION_PRIVACY_PARAGRAPH')
    expect(SUGGESTION_PRIVACY_PARAGRAPH).toBe(
      'If you suggest something, we store the feedback (whether you like something, want something added, or want something removed, and the message) and we store your email address only when you choose to include it.',
    )
    expect(notifySuggestion({ id: 1, kind: 'like' })).toEqual({
      sent: false,
      reason: 'no-mail-transport',
      to: 'mark@bestbotfor.com',
    })
  })

  it('inlines the Lucide lightbulb in currentColor and brand indigo', () => {
    const html = renderToStaticMarkup(createElement(LightbulbIcon))
    expect(html).toContain('stroke="currentColor"')
    expect(html).toContain(`color:${BRAND.indigo}`)
    expect(html).toContain('class="size-5 shrink-0 text-indigo"')
    expect(BRAND.indigo).toBe('#5B4BFF')
    const license = readFileSync(path.join(process.cwd(), 'LICENSE-lucide.txt'), 'utf8')
    expect(license).toContain('ISC License')
    expect(license).toContain('Copyright (c) 2026 Lucide Icons and Contributors')
    expect(source('src/components/lightbulb-icon.tsx')).toContain('M15 14c.2-1 .7-1.7 1.5-2.5')
    expect(source('package.json')).not.toContain('lucide-react')
  })
})

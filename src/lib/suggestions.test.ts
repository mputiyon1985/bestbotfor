import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createClient } from '@libsql/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LightbulbIcon } from '@/components/lightbulb-icon'
import { ACTION_LIMITS } from '@/lib/action-limit'
import { BRAND } from '@/lib/brand'
import { SUGGESTIONS_DDL, adoptSuggestionsSchema } from '@/lib/db/migrate'
import { suggestions } from '@/lib/db/schema'
import { SUGGESTION_PRIVACY_PARAGRAPH, suggestionPrivacyParagraph } from '@/lib/privacy-copy'
import { notifySuggestion, SUGGESTION_NOTIFY_EMAIL } from '@/lib/suggestion-mail'
import { SUGGESTION_SUCCESS, cleanSuggestionMessage, hasVisibleText, submitSuggestion } from '@/lib/suggestions'
import { createTestDatabase } from '@/test/db'
import { eq } from 'drizzle-orm'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

function rateRows(rows: ReadonlyArray<Record<string, unknown>>): { key: string; count: number }[] {
  return rows.map((row) => ({ key: String(row.key), count: Number(row.count) }))
}

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
    const limits = await test.db.$client.execute('SELECT "key", count FROM rate_limits')
    expect(rateRows(limits.rows)).toEqual([{ key: 'hash-one', count: 1 }])
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
    expect(long).toEqual({ status: 'error', field: 'message', message: 'Keep the message under 2000 characters.' })
    expect(kind).toEqual({ status: 'error', field: 'kind', message: 'Choose like, add, or remove.' })
    expect(email).toEqual({ status: 'error', field: 'email', message: 'Enter a valid email address.' })
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
    const limits = await test.db.$client.execute('SELECT "key" FROM rate_limits')
    expect(limits.rows.map((row) => String(row.key))).toEqual(['hash-length'])
    await test.close()
  })

  it('writes the HMAC to rate_limits and blocks the 6th submit across calls', async () => {
    const test = await createTestDatabase()
    const rateKey = 'suggestion-hmac-not-an-address'
    for (let index = 0; index < ACTION_LIMITS.suggestion.limit; index += 1) {
      const result = await submitSuggestion({
        kind: 'like',
        message: `Note ${index}`,
        email: '',
        honeypot: '',
        db: test.db,
        rateKey,
        now: 1_000 + index,
      })
      expect(result.status).toBe('success')
    }
    const stored = await test.db.$client.execute({
      sql: 'SELECT "key", count FROM rate_limits WHERE "key" = ?',
      args: [rateKey],
    })
    expect(rateRows(stored.rows)).toEqual([{ key: rateKey, count: ACTION_LIMITS.suggestion.limit }])
    const blocked = await submitSuggestion({
      kind: 'like',
      message: 'One more',
      email: '',
      honeypot: '',
      db: test.db,
      rateKey,
      now: 2_000,
    })
    expect(blocked).toEqual({ status: 'error', message: 'Too many suggestions. Try again in an hour.' })
    const again = await submitSuggestion({
      kind: 'remove',
      message: 'Still one more',
      email: '',
      honeypot: '',
      db: test.db,
      rateKey,
      now: 3_000,
    })
    expect(again).toEqual({ status: 'error', message: 'Too many suggestions. Try again in an hour.' })
    const rows = await test.db.select().from(suggestions)
    expect(rows).toHaveLength(ACTION_LIMITS.suggestion.limit)
    expect(JSON.stringify(rows)).not.toContain(rateKey)
    const limits = await test.db.$client.execute('SELECT "key", count FROM rate_limits')
    expect(rateRows(limits.rows)).toEqual([{ key: rateKey, count: ACTION_LIMITS.suggestion.limit + 2 }])
    await test.close()
  })

  it('strips NUL and control characters but keeps newlines and tabs', async () => {
    const test = await createTestDatabase()
    const result = await submitSuggestion({
      kind: 'add',
      message: '  Line one\u0000 kept\r\n\tLine two\u0007\u001b\u009b end  ',
      email: '',
      honeypot: '',
      db: test.db,
      rateKey: 'hash-clean',
      now: 50,
    })
    expect(result.status).toBe('success')
    const rows = await test.db.select().from(suggestions)
    expect(rows[0]?.message).toBe('Line one kept\n\tLine two end')
    expect(cleanSuggestionMessage('a\u0000b\nc\td')).toBe('ab\nc\td')
    await test.close()
  })

  it('rejects a message of only invisible or whitespace characters, without using the limit', async () => {
    const test = await createTestDatabase()
    for (const message of [
      '\u200b\u200b',
      '\u200b \u2060\ufeff',
      '\u00a0\u3000\t\n',
      '\u0000\u0001',
      '\u202e\u2066',
      '\u3164\u2800',
      '\u0301\u0301',
      '\ufe0f',
      ' \u0301\ufe0f\ufe0e ',
      '\u{E0100}\u{E01EF}',
      '\u20dd\u0489',
    ]) {
      expect(hasVisibleText(cleanSuggestionMessage(message))).toBe(false)
      const result = await submitSuggestion({ kind: 'like', message, email: '', honeypot: '', db: test.db, rateKey: 'hash-blank', now: 60 })
      expect(result).toEqual({ status: 'error', field: 'message', message: 'Enter a message.' })
    }
    expect(hasVisibleText('e\u0301')).toBe(true)
    expect(hasVisibleText('\u{1F600}')).toBe(true)
    expect(hasVisibleText('\u2764\ufe0f')).toBe(true)
    expect(hasVisibleText('7')).toBe(true)
    expect(hasVisibleText('?')).toBe(true)
    expect(hasVisibleText('\u0301a')).toBe(true)
    expect(await test.db.select().from(suggestions)).toEqual([])
    const limits = await test.db.$client.execute('SELECT "key" FROM rate_limits')
    expect(limits.rows).toHaveLength(0)
    await test.close()
  })

  it('fails closed when the rate limiter throws: unavailable error and no row', async () => {
    const test = await createTestDatabase()
    await test.db.$client.execute('DROP TABLE rate_limits')
    const notify = vi.fn(notifySuggestion)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await submitSuggestion({
      kind: 'add',
      message: 'Valid note while the limiter is down',
      email: 'reader@example.com',
      honeypot: '',
      db: test.db,
      rateKey: 'hash-limiter-down',
      now: 300,
      notify,
    })
    errors.mockRestore()
    expect(result).toEqual({ status: 'error', message: 'Suggestions are temporarily unavailable. Try again.' })
    expect(await test.db.select().from(suggestions)).toEqual([])
    expect(notify).not.toHaveBeenCalled()
    await test.close()
  })

  it('validates before consuming the limit, so failed submits do not lock out a valid one', async () => {
    const test = await createTestDatabase()
    const rateKey = 'hash-typos'
    for (let index = 0; index < ACTION_LIMITS.suggestion.limit + 3; index += 1) {
      const bad = await submitSuggestion({ kind: 'like', message: index % 2 ? '' : 'Hi', email: index % 2 ? '' : 'bad@', honeypot: '', db: test.db, rateKey, now: 100 + index })
      expect(bad.status).toBe('error')
    }
    const limits = await test.db.$client.execute({ sql: 'SELECT "key" FROM rate_limits WHERE "key" = ?', args: [rateKey] })
    expect(limits.rows).toHaveLength(0)
    const good = await submitSuggestion({ kind: 'like', message: 'Real note', email: '', honeypot: '', db: test.db, rateKey, now: 200 })
    expect(good).toEqual({ status: 'success', message: SUGGESTION_SUCCESS })
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
    expect(source('src/lib/suggestions.ts')).toContain('ACTION_LIMITS.suggestion')
    expect(source('src/lib/suggestions.ts')).toContain('allowRate')
    expect(source('src/lib/action-limit.ts')).toContain('consumeRateLimit')
    expect(existsSync(path.join(process.cwd(), 'src/lib/suggestion-rate.ts'))).toBe(false)
    expect(source('src/app/layout.tsx')).toContain('<SuggestSomethingLink')
    expect(source('src/app/layout.tsx')).toContain('<SuggestionDialog')
    expect(source('src/components/site-footer.tsx')).toContain('<SuggestSomethingLink')
    const page = source('src/app/privacy/page.tsx')
    expect(page).toContain('SUGGESTION_PRIVACY_PARAGRAPH')
    expect(SUGGESTION_PRIVACY_PARAGRAPH).toContain(
      'If you suggest something, we store the feedback (whether you like something, want something added, or want something removed, and the message) and we store your email address only when you choose to include it.',
    )
    const off = SUGGESTION_PRIVACY_PARAGRAPH
    const offState =
      'The retention job that applies our suggestion limits is off in production now, so until it is switched on, the email and the suggestion have no fixed deletion date.'
    expect(off).toContain(offState)
    expect(off).toContain(
      'When it is switched on, we keep your email address for up to 90 days so we can reply, then clear it and keep the note, and we delete each suggestion 24 months after you send it.',
    )
    expect(off.indexOf(offState)).toBeLessThan(off.indexOf('90 days'))
    expect(off).toContain('we do not add it to the newsletter or send it to Beehiiv.')
    expect(off).not.toContain('email provider')
    const on = suggestionPrivacyParagraph(true)
    expect(on).toContain('We keep your email address for up to 90 days so we can reply, then clear it and keep the note.')
    expect(on).toContain('We delete each suggestion 24 months after you send it.')
    expect(on).toContain('we do not add it to the newsletter or send it to Beehiiv.')
    expect(on).not.toContain('no fixed deletion date')
    expect(suggestionPrivacyParagraph(true)).toContain('The retention job does this about once a day.')
    expect(suggestionPrivacyParagraph(true)).not.toContain('off in production')
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

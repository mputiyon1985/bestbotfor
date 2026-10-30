import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { toCsv } from '@/lib/signups/csv'
import { filterSignups } from '@/lib/signups/filter'

const CLIENT_FILES = [
  'src/components/signups-table.tsx',
  'src/lib/signups/format.ts',
  'src/lib/signups/filter.ts',
  'src/lib/signups/types.ts',
]

const SECRET_NAMES = [
  'SIGNUPS_SESSION_SECRET',
  'SIGNUPS_ADMIN_PASSWORD_HASH',
  'SIGNUPS_TOTP_SECRET',
  'SIGNUPS_TURSO_AUTH_TOKEN',
  'SIGNUPS_TURSO_DATABASE_URL',
  'BEEHIIV_API_KEY',
  'CLERK_SECRET_KEY',
]

describe('privacy', () => {
  it('does not put secret env names in client modules', () => {
    for (const file of CLIENT_FILES) {
      const text = readFileSync(path.join(process.cwd(), file), 'utf8')
      for (const name of SECRET_NAMES) expect(text, file).not.toContain(name)
      expect(text, file).not.toContain('process.env')
    }
  })

  it('escapes csv formula characters', () => {
    const csv = toCsv([{ source: 'turso', email: '=cmd@example.com', createdAt: '2026-01-01T00:00:00.000Z' }])
    expect(csv.startsWith('source,email,created_at')).toBe(true)
    expect(csv).toContain("'=cmd@example.com")
  })

  it('filters the combined list by source and email', () => {
    const rows = [
      { source: 'turso' as const, email: 'Ada@example.com', createdAt: '2026-01-02T00:00:00.000Z' },
      { source: 'clerk' as const, email: 'bea@example.com', createdAt: '2026-01-01T00:00:00.000Z' },
    ]
    expect(filterSignups(rows, 'turso', '').map((row) => row.email)).toEqual(['Ada@example.com'])
    expect(filterSignups(rows, 'all', 'bea').map((row) => row.email)).toEqual(['bea@example.com'])
    expect(filterSignups(rows, 'clerk', 'ada')).toEqual([])
  })

  it('does not refetch from the browser', () => {
    const table = readFileSync(path.join(process.cwd(), 'src/components/signups-table.tsx'), 'utf8')
    expect(table).not.toContain('fetch(')
    expect(table).not.toContain('setInterval')
    expect(table).not.toContain('useEffect')
  })
})

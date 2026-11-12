import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { POST } from '@/app/admin/leads/import/route'
import { createClient } from '@libsql/client'
import guardConfig from '../../../config/db-guard.json'
import { getDb, resetDbCache } from '@/lib/db/client'
import { applyMigrations } from '@/lib/db/migrate'
import { createLeadsSessionToken, LEADS_SESSION_COOKIE } from '@/lib/leads/auth/session'
import { parseLeadCsv, parseLeadJson } from '@/lib/leads/parse'
import { leadsScriptRefuses } from '@/lib/leads/script'
import { listLeads, upsertLeads } from '@/lib/leads/store'
import { leadSummary } from '@/lib/leads/model'
import { withSignupsAuthDb } from '@/lib/signups/auth/fixture-db'

const execFileAsync = promisify(execFile)
const PASSWORD = 'test-leads-password-value'

const ada = {
  company: 'Example Co',
  contact_email: 'Ada@Example.com',
  type: 'affiliate',
  status: 'replied',
  first_contact: '2026-11-01',
  last_touch: '2026-11-10',
  touches: 2,
  next_step: 'Send terms',
  next_date: '2026-11-20',
  notes: 'Asked for the kit',
  amount_closed_usd: null,
}

const paid = {
  company: 'Paid Example',
  contact_email: 'paid@example.com',
  type: 'sponsor',
  status: 'closed',
  touches: 4,
  amount_closed_usd: 1500,
}

function importRequest(body: string, contentType: string, cookie?: string, bearer?: string) {
  const headers = new Headers({
    origin: 'https://dash.example',
    host: 'dash.example',
    'content-type': contentType,
  })
  if (cookie) headers.set('cookie', `${LEADS_SESSION_COOKIE}=${cookie}`)
  if (bearer) headers.set('authorization', `Bearer ${bearer}`)
  return new Request('https://dash.example/admin/leads/import', { method: 'POST', headers, body })
}

let closeDb: (() => Promise<void>) | undefined

afterEach(async () => {
  await closeDb?.()
  closeDb = undefined
  delete process.env.BBF_LEADS_PASSWORD
})

describe('lead upsert validation', () => {
  it('rejects a bad email, a bad status, and a bad amount without echoing the value', () => {
    const bad = parseLeadJson([
      { company: 'Example Co', contact_email: 'not-an-email', type: 'affiliate', status: 'contacted' },
      { company: 'Example Co', contact_email: 'ada@example.com', type: 'affiliate', status: 'maybe', amount_closed_usd: -5 },
    ])
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.errors.join('\n')).toContain('contact_email is invalid')
    expect(bad.errors.join('\n')).toContain('status must be')
    expect(bad.errors.join('\n')).toContain('amount_closed_usd is invalid')
    expect(bad.errors.join('\n')).not.toContain('not-an-email')
    expect(bad.errors.join('\n')).not.toContain('-5')

    const csv = parseLeadCsv('company,contact_email,type,status\n"Comma, Co",ada@example.com,affiliate,contacted\n')
    expect(csv.ok).toBe(true)
    if (!csv.ok) return
    expect(csv.rows[0]).toMatchObject({ company: 'Comma, Co', contactEmail: 'ada@example.com', touches: 0, amountClosedUsd: null })

    const duplicate = parseLeadJson([
      { company: 'A', contact_email: 'Ada@example.com', type: 'affiliate', status: 'contacted' },
      { company: 'B', contact_email: 'ada@example.com', type: 'affiliate', status: 'replied' },
    ])
    expect(duplicate.ok).toBe(false)
    if (!duplicate.ok) expect(duplicate.errors.join('\n')).toContain('repeats an earlier contact_email')
  })

  it('refuses a production database unless the launch flag is set', () => {
    const host = guardConfig.prodHosts[0] ?? ''
    expect(host.length).toBeGreaterThan(0)
    expect(leadsScriptRefuses(`libsql://${host}`, false)).toBe(true)
    expect(leadsScriptRefuses(`libsql://${host}`, true)).toBe(false)
    expect(leadsScriptRefuses('file:/tmp/leads.db', false)).toBe(false)
    expect(leadsScriptRefuses('not a url', false)).toBe(true)
  })
})

describe('lead upsert storage', () => {
  it('creates the table, upserts on email, and matches the summary', async () => {
    closeDb = await withSignupsAuthDb()
    process.env.BBF_LEADS_PASSWORD = PASSWORD
    const db = getDb()
    const info = await db.$client.execute('PRAGMA table_info(bbf_leads)')
    expect(info.rows.map((row) => String(row.name))).toEqual([
      'id',
      'company',
      'contact_email',
      'type',
      'first_contact',
      'last_touch',
      'touches',
      'status',
      'next_step',
      'next_date',
      'notes',
      'amount_closed_usd',
      'created_at',
      'updated_at',
    ])
    const indexes = await db.$client.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'bbf_leads' ORDER BY name")
    expect(indexes.rows.map((row) => String(row.name))).toContain('bbf_leads_contact_email_key')

    const parsed = parseLeadJson([ada, paid])
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    await upsertLeads(db, parsed.rows, 1_000)
    await upsertLeads(db, [{ ...parsed.rows[0]!, company: 'Updated Example' }], 2_000)

    const rows = await listLeads(db)
    expect(rows).toHaveLength(2)
    const updated = rows.find((row) => row.contactEmail === 'ada@example.com')
    expect(updated).toMatchObject({ company: 'Updated Example', createdAt: 1_000, updatedAt: 2_000, status: 'replied' })
    expect(leadSummary(rows)).toMatchObject({ replied: 1, closedUsd: 1500, closedCount: 1, contacted: 0 })

    const { token } = createLeadsSessionToken(PASSWORD)
    const response = await POST(
      importRequest(
        JSON.stringify([{ company: 'Third Example', contact_email: 'third@example.com', type: 'partner', status: 'bounced' }]),
        'application/json',
        token,
      ),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ upserted: 1 })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')

    const bad = await POST(
      importRequest(JSON.stringify([{ company: 'X', contact_email: 'still-bad', type: 'affiliate', status: 'contacted' }]), 'application/json', token),
    )
    expect(bad.status).toBe(400)
    const body = await bad.text()
    expect(body).not.toContain('still-bad')
    expect((await listLeads(db)).some((row) => row.company === 'X')).toBe(false)

    const bearer = await POST(
      importRequest(
        'company,contact_email,type,status,amount_closed_usd\nBearer Example,bearer@example.com,affiliate,declined,\n',
        'text/csv',
        undefined,
        PASSWORD,
      ),
    )
    expect(bearer.status).toBe(200)
    expect((await listLeads(db)).some((row) => row.contactEmail === 'bearer@example.com' && row.status === 'declined')).toBe(true)
  })
})

describe('leads upsert script', () => {
  it('upserts a local file and does not print the address', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'leads-script-'))
    const file = path.join(root, 'leads.json')
    const url = `file:${path.join(root, 'leads.db')}`
    await writeFile(
      file,
      JSON.stringify([
        { company: 'Example Co', contact_email: 'ada@example.com', type: 'affiliate', status: 'contacted' },
        { company: 'Paid Example', contact_email: 'paid@example.com', type: 'sponsor', status: 'closed', amount_closed_usd: 20 },
      ]),
    )
    await applyMigrations(url)
    try {
      const { stdout, stderr } = await execFileAsync(path.join(process.cwd(), 'node_modules/.bin/tsx'), ['scripts/upsert-leads.ts', file], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, TURSO_DATABASE_URL: url, VERCEL_ENV: 'test', BBF_LEADS_PASSWORD: '' },
      })
      const combined = `${stdout}\n${stderr}`
      expect(stdout).toContain('upserted: 2')
      expect(combined).not.toContain('ada@example.com')
      expect(combined).not.toContain('paid@example.com')
      resetDbCache()
      const client = createClient({ url })
      const rows = await client.execute('SELECT contact_email, status, amount_closed_usd FROM bbf_leads ORDER BY contact_email')
      expect(rows.rows).toEqual([
        { contact_email: 'ada@example.com', status: 'contacted', amount_closed_usd: null },
        { contact_email: 'paid@example.com', status: 'closed', amount_closed_usd: 20 },
      ])
      client.close()
    } finally {
      resetDbCache()
      await rm(root, { recursive: true, force: true })
    }
  }, 20_000)
})

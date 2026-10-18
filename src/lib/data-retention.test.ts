import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestDatabase } from '@/test/db'
import { clicks, rateLimits, suggestions } from '@/lib/db/schema'
import { DATA_RETENTION_PRODUCTION_LAUNCH } from './retention-flags'
import {
  CLICK_HASH_RETENTION_MS,
  RATE_LIMIT_RETENTION_MS,
  clickHashCutoff,
  CRON_SECRET_MIN_LENGTH,
  cronAuthorized,
  dataRetentionDryRun,
  dataRetentionEnabled,
  decideRetentionRequest,
  rateLimitCutoff,
  resultWindowCutoff,
  retentionLogLine,
  retentionTargetOk,
  type RetentionReport,
  SUGGESTION_EMAIL_RETENTION_MS,
  SUGGESTION_ROW_RETENTION_MS,
} from './data-retention'
import { consumeRateLimit, consumeResultRateLimit, resetLocalRateLimits } from './rate-limit'
import { HEAD, handleRetentionCron, runDataRetention } from '@/app/api/cron/data-retention/route'

const now = Date.parse('2026-10-17T20:00:00Z')
const day = 24 * 60 * 60 * 1000
const windowMs = 60_000
const sharedBudgetMs = 2_000
const cutoff = now - day
const secret = 'cron-secret-for-tests-only-32b-x'
const quizExpired = 'quiz-expired-a'
const quizExpiredOther = 'quiz-expired-b'
const quizBoundary = 'quiz-boundary'
const quizOpen = 'quiz-open'
const oldKey = 'rate-old-key'
const boundaryKey = 'rate-boundary-key'
const activeKey = 'rate-active-key'
const oldHash = 'e'.repeat(64)
const youngHash = 'f'.repeat(64)
const quizWriteNow = cutoff - 2 * windowMs

function request(authorization: string | null, method = 'GET'): Request {
  const headers = new Headers()
  if (authorization !== null) headers.set('authorization', authorization)
  return new Request('http://localhost/api/cron/data-retention', { headers, method })
}

describe('data retention decisions', () => {
  it('fails closed, stays off in production, and dry-runs unless writing is explicit', () => {
    expect(DATA_RETENTION_PRODUCTION_LAUNCH).toBe(false)
    expect(dataRetentionEnabled({})).toBe(false)
    expect(dataRetentionEnabled({ purge: 'on' })).toBe(false)
    expect(dataRetentionEnabled({ purge: 'on', vercelEnv: 'production' })).toBe(false)
    expect(dataRetentionEnabled({ purge: 'on', vercelEnv: 'preview' })).toBe(true)
    expect(dataRetentionEnabled({ purge: ' on ', vercelEnv: 'test' })).toBe(true)
    expect(dataRetentionEnabled({ purge: 'on', vercelEnv: 'development' })).toBe(true)
    expect(dataRetentionEnabled({ purge: 'yes', vercelEnv: 'test' })).toBe(false)
    expect(dataRetentionEnabled({ purge: 'on', vercelEnv: 'production' }, true)).toBe(true)
    expect(dataRetentionDryRun({})).toBe(true)
    expect(dataRetentionDryRun({ dryRun: 'on' })).toBe(true)
    expect(dataRetentionDryRun({ dryRun: 'off' })).toBe(false)
    expect(dataRetentionDryRun({ dryRun: ' off ' })).toBe(false)
  })

  it('does not read NODE_ENV, and the production constant ships false with no env access', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/lib/data-retention.ts'), 'utf8')
    const constants = readFileSync(path.join(process.cwd(), 'src/lib/retention-flags.ts'), 'utf8')
    expect(source).not.toContain('NODE_ENV')
    expect(constants).toContain('export const DATA_RETENTION_PRODUCTION_LAUNCH: boolean = false')
    expect(constants).not.toContain('process.env')
  })

  it('rejects a missing, empty, short, or wrong cron secret without accepting a shorter prefix', () => {
    expect(secret.length).toBeGreaterThanOrEqual(CRON_SECRET_MIN_LENGTH)
    expect(CRON_SECRET_MIN_LENGTH).toBe(32)
    expect(cronAuthorized(null, undefined)).toBe(false)
    expect(cronAuthorized(`Bearer ${secret}`, '')).toBe(false)
    expect(cronAuthorized(null, secret)).toBe(false)
    expect(cronAuthorized('Bearer', secret)).toBe(false)
    expect(cronAuthorized(`Bearer ${secret.slice(0, 4)}`, secret)).toBe(false)
    const short = 'a'.repeat(CRON_SECRET_MIN_LENGTH - 1)
    expect(cronAuthorized(`Bearer ${short}`, short)).toBe(false)
    expect(cronAuthorized(`Bearer ${secret}`, secret)).toBe(true)
    const decision = decideRetentionRequest({
      authorization: 'Bearer wrong',
      cronSecret: secret,
      env: { purge: 'on', vercelEnv: 'test', dryRun: 'off' },
    })
    expect(decision.ok).toBe(false)
  })

  it('does not run when the flag is off, even if dry-run is off', () => {
    const decision = decideRetentionRequest({
      authorization: `Bearer ${secret}`,
      cronSecret: secret,
      env: { purge: 'on', vercelEnv: 'production', dryRun: 'off' },
    })
    expect(decision.ok).toBe(true)
    if (decision.ok) {
      expect(decision.run).toBe(false)
      if (!decision.run) expect(decision.report.wrote).toBe(false)
    }
  })

  it('counts a window that ended more than 24 hours ago, and a click older than 90 days', () => {
    expect(rateLimitCutoff(now)).toBe(now - RATE_LIMIT_RETENTION_MS)
    expect(resultWindowCutoff(now)).toBe(now - RATE_LIMIT_RETENTION_MS)
    expect(clickHashCutoff(now)).toBe(now - CLICK_HASH_RETENTION_MS)
    expect(now - day).not.toBeLessThan(rateLimitCutoff(now))
    expect(now - day - 1).toBeLessThan(rateLimitCutoff(now))
    expect(cutoff - windowMs).toBeLessThan(resultWindowCutoff(now))
    expect(cutoff).not.toBeLessThan(resultWindowCutoff(now))
  })

  it('allows a local file and refuses a production host outside production', () => {
    const prod = 'libsql://bestbotfor-mputiyon1985.aws-us-east-1.turso.io'
    expect(retentionTargetOk({ protocol: 'file' })).toBe(true)
    expect(retentionTargetOk({ url: 'file:./data/retention.db', protocol: 'file', vercelEnv: 'test' })).toBe(true)
    expect(retentionTargetOk({ url: prod, protocol: 'http', vercelEnv: 'test' })).toBe(false)
    expect(retentionTargetOk({ url: prod, protocol: 'http', vercelEnv: 'production' })).toBe(true)
    expect(retentionTargetOk({ url: prod, protocol: 'file', vercelEnv: 'production' })).toBe(false)
    expect(retentionTargetOk({ protocol: 'http', vercelEnv: 'test' })).toBe(false)
    expect(
      retentionTargetOk({
        url: 'libsql://bestbotfor-preview-test-mputiyon1985.aws-us-east-1.turso.io',
        protocol: 'http',
        vercelEnv: 'preview',
      }),
    ).toBe(true)
  })
})

describe('data retention job', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetLocalRateLimits()
  })

  async function writeQuiz(db: Awaited<ReturnType<typeof createTestDatabase>>['db'], key: string, writeNow: number) {
    resetLocalRateLimits()
    const decision = await consumeResultRateLimit(db, key, 5, windowMs, writeNow, sharedBudgetMs)
    expect(decision.ok).toBe(true)
    const start = Math.floor(writeNow / windowMs) * windowMs
    expect(decision.resetAt).toBe(start + windowMs)
  }

  async function seed() {
    const { db, close } = await createTestDatabase()
    await writeQuiz(db, quizExpired, quizWriteNow)
    await writeQuiz(db, quizExpiredOther, quizWriteNow)
    await writeQuiz(db, quizBoundary, cutoff - windowMs)
    await writeQuiz(db, quizOpen, now)
    const old = await consumeRateLimit(db, oldKey, 5, windowMs, cutoff - windowMs - 1)
    const boundary = await consumeRateLimit(db, boundaryKey, 5, windowMs, cutoff - windowMs)
    const active = await consumeRateLimit(db, activeKey, 5, windowMs, now)
    expect(old.resetAt).toBe(cutoff - 1)
    expect(boundary.resetAt).toBe(cutoff)
    expect(active.resetAt).toBe(now + windowMs)
    await db.insert(clicks).values([
      { toolId: 1, page: '/tools/chatgpt', ts: now - CLICK_HASH_RETENTION_MS - 1, country: 'US', ipHash: oldHash },
      { toolId: 1, page: '/tools/claude', ts: now - day, country: 'US', ipHash: youngHash },
      { toolId: 2, page: '/go/chatgpt', ts: now - CLICK_HASH_RETENTION_MS - day, country: null, ipHash: null },
    ])
    return { db, close }
  }

  async function countResultWindows(db: Awaited<ReturnType<typeof createTestDatabase>>['db']): Promise<number> {
    const result = await db.$client.execute('SELECT COUNT(*) AS n FROM result_rate_windows')
    return Number(result.rows[0]?.n ?? 0)
  }

  async function resultWindowExpiries(db: Awaited<ReturnType<typeof createTestDatabase>>['db']): Promise<number[]> {
    const result = await db.$client.execute('SELECT expires_at FROM result_rate_windows')
    return result.rows.map((row) => Number(row.expires_at)).sort((left, right) => left - right)
  }

  function expiredBucket(): string {
    const start = Math.floor(quizWriteNow / windowMs) * windowMs
    return createHash('sha256').update(`bestbotfor-result-window|${quizExpired}|${start}`).digest('hex')
  }

  it('dry-run counts quiz windows and old keys, and writes nothing', async () => {
    const { db, close } = await seed()
    try {
      const report = await runDataRetention(db, { dryRun: true, now })
      expect(report.rateLimitsEligible).toBe(1)
      expect(report.resultWindowsEligible).toBe(2)
      expect(report.clickHashesEligible).toBe(1)
      expect(report.rateLimitsDeleted).toBe(0)
      expect(report.resultWindowsDeleted).toBe(0)
      expect(report.clickHashesCleared).toBe(0)
      expect(report.wrote).toBe(false)
      expect(await db.select().from(rateLimits)).toHaveLength(3)
      expect(await countResultWindows(db)).toBe(4)
      const logged = await db.select().from(clicks)
      expect(logged.find((row) => row.page === '/tools/chatgpt')?.ipHash).toBe(oldHash)
      const line = retentionLogLine(report)
      expect(line).not.toContain(quizExpired)
      expect(line).not.toContain(oldKey)
      expect(line).not.toContain(oldHash)
      expect(line).not.toContain(expiredBucket())
    } finally {
      await close()
    }
  })

  it('deletes expired quiz windows and old keys, clears old click hashes, and leaves the click rows', async () => {
    const { db, close } = await seed()
    try {
      const report = await runDataRetention(db, { dryRun: false, now, batchSize: 1, maxBatches: 10 })
      expect(report.rateLimitsDeleted).toBe(1)
      expect(report.resultWindowsDeleted).toBe(2)
      expect(report.clickHashesCleared).toBe(1)
      expect(report.wrote).toBe(true)
      expect(report.truncated).toBe(false)
      expect(report.rateLimitsDeleted).toBe(report.rateLimitsEligible)
      expect(report.resultWindowsDeleted).toBe(report.resultWindowsEligible)
      expect(report.clickHashesCleared).toBe(report.clickHashesEligible)
      const limits = await db.select({ resetAt: rateLimits.resetAt }).from(rateLimits)
      expect(limits.map((row) => row.resetAt).sort()).toEqual([cutoff, now + windowMs].sort())
      expect(await resultWindowExpiries(db)).toEqual([cutoff, now + windowMs].sort((left, right) => left - right))
      const logged = await db.select().from(clicks)
      expect(logged).toHaveLength(3)
      const aged = logged.find((row) => row.page === '/tools/chatgpt')
      expect(aged?.ipHash).toBeNull()
      expect(aged?.toolId).toBe(1)
      expect(logged.find((row) => row.page === '/tools/claude')?.ipHash).toBe(youngHash)
      const again = await runDataRetention(db, { dryRun: false, now })
      expect(again.rateLimitsDeleted).toBe(0)
      expect(again.resultWindowsDeleted).toBe(0)
      expect(again.clickHashesCleared).toBe(0)
      expect(again.wrote).toBe(false)
    } finally {
      await close()
    }
  })

  it('clears suggestion emails after 90 days and deletes suggestions after 24 months, never logging their text', async () => {
    const { db, close } = await createTestDatabase()
    try {
      expect(SUGGESTION_EMAIL_RETENTION_MS).toBe(90 * day)
      expect(SUGGESTION_ROW_RETENTION_MS).toBe(730 * day)
      await db.insert(suggestions).values([
        { kind: 'like', message: 'fresh', email: 'fresh@example.com', createdAt: now - day },
        { kind: 'add', message: 'email edge', email: 'edge@example.com', createdAt: now - SUGGESTION_EMAIL_RETENTION_MS },
        { kind: 'add', message: 'old email', email: 'old@example.com', createdAt: now - SUGGESTION_EMAIL_RETENTION_MS - 1 },
        { kind: 'remove', message: 'row edge', email: null, createdAt: now - SUGGESTION_ROW_RETENTION_MS },
        { kind: 'remove', message: 'ancient', email: 'ancient@example.com', createdAt: now - SUGGESTION_ROW_RETENTION_MS - 1 },
      ])
      const dry = await runDataRetention(db, { dryRun: true, now })
      expect(dry).toMatchObject({ suggestionEmailsEligible: 1, suggestionsEligible: 1, suggestionEmailsCleared: 0, suggestionsDeleted: 0 })
      expect(await db.select().from(suggestions)).toHaveLength(5)
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      const report = await runDataRetention(db, { dryRun: false, now, batchSize: 1, maxBatches: 10 })
      expect(report).toMatchObject({ suggestionEmailsCleared: 1, suggestionsDeleted: 1, truncated: false, wrote: true })
      const rows = await db.select().from(suggestions)
      expect(rows.map((row) => [row.message, row.email]).sort()).toEqual(
        [
          ['email edge', 'edge@example.com'],
          ['fresh', 'fresh@example.com'],
          ['old email', null],
          ['row edge', null],
        ].sort(),
      )
      expect(JSON.stringify(report)).not.toMatch(/example\.com|ancient|old email/)
      log.mockRestore()
      const again = await runDataRetention(db, { dryRun: false, now })
      expect(again).toMatchObject({ suggestionEmailsCleared: 0, suggestionsDeleted: 0 })
    } finally {
      await close()
    }
  })

  it('skips only the suggestion purge when the suggestions table is missing', async () => {
    const { db, close } = await createTestDatabase()
    try {
      await db.$client.execute('DROP TABLE suggestions')
      await db.insert(clicks).values({ toolId: 1, page: '/tools/chatgpt', ts: now - CLICK_HASH_RETENTION_MS - 1, country: 'US', ipHash: oldHash })
      const report = await runDataRetention(db, { dryRun: false, now })
      expect(report).toMatchObject({ clickHashesCleared: 1, suggestionsEligible: 0, suggestionsDeleted: 0, suggestionEmailsCleared: 0 })
    } finally {
      await close()
    }
  })

  it('stops at the batch cap and continues on the next run', async () => {
    const { db, close } = await seed()
    try {
      const partial = await runDataRetention(db, { dryRun: false, now, batchSize: 1, maxBatches: 1 })
      expect(partial.resultWindowsDeleted).toBe(1)
      expect(partial.resultWindowsDeleted).toBeLessThan(partial.resultWindowsEligible)
      expect(partial.truncated).toBe(true)
      const rest = await runDataRetention(db, { dryRun: false, now, batchSize: 1, maxBatches: 10 })
      expect(rest.resultWindowsDeleted).toBe(1)
      expect(rest.truncated).toBe(false)
    } finally {
      await close()
    }
  })

  it('does not open the database when the secret or the flag refuses the job', async () => {
    const { db, close } = await seed()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      let opened = 0
      const denied = await handleRetentionCron(request('Bearer wrong'), {
        db: () => {
          opened += 1
          return db
        },
        cronSecret: secret,
        env: { purge: 'on', vercelEnv: 'test', dryRun: 'off' },
        now,
      })
      expect(denied.status).toBe(401)
      expect(opened).toBe(0)
      const disabled = await handleRetentionCron(request(`Bearer ${secret}`), {
        db: () => {
          opened += 1
          return db
        },
        cronSecret: secret,
        env: { purge: 'on', vercelEnv: 'production', dryRun: 'off' },
        now,
      })
      expect(disabled.status).toBe(200)
      const body = (await disabled.json()) as RetentionReport
      expect(body.enabled).toBe(false)
      expect(body.wrote).toBe(false)
      expect(opened).toBe(0)
      const logged = log.mock.calls.map((call) => String(call[0])).join('\n')
      expect(logged).not.toContain(oldHash)
      expect(logged).not.toContain(quizExpired)
      expect(logged).not.toContain(expiredBucket())
      expect(error.mock.calls.join('\n')).not.toContain('Bearer')
      const limits = await db.select().from(rateLimits)
      expect(limits).toHaveLength(3)
      expect(await countResultWindows(db)).toBe(4)
    } finally {
      await close()
    }
  })

  it('HEAD does not run the job', async () => {
    const { db, close } = await seed()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      let opened = 0
      const head = HEAD()
      expect(head.status).toBe(405)
      expect(head.headers.get('allow')).toBe('GET')
      expect(head.headers.get('cache-control')).toBe('no-store')
      const refused = await handleRetentionCron(request(`Bearer ${secret}`, 'HEAD'), {
        db: () => {
          opened += 1
          return db
        },
        cronSecret: secret,
        env: { purge: 'on', vercelEnv: 'test', dryRun: 'off' },
        now,
      })
      expect(refused.status).toBe(405)
      expect(opened).toBe(0)
      expect(log).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
      expect(await db.select().from(rateLimits)).toHaveLength(3)
      expect(await countResultWindows(db)).toBe(4)
    } finally {
      await close()
    }
  })

  it('counts eligible rows and writes nothing when the target does not match the client', async () => {
    const { db, close } = await seed()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const prod = 'libsql://bestbotfor-mputiyon1985.aws-us-east-1.turso.io'
    try {
      const report = await runDataRetention(db, { dryRun: false, now, url: prod, vercelEnv: 'test' })
      expect(report.dryRun).toBe(false)
      expect(report.wrote).toBe(false)
      expect(report.rateLimitsEligible).toBe(1)
      expect(report.resultWindowsEligible).toBe(2)
      expect(report.clickHashesEligible).toBe(1)
      expect(report.rateLimitsDeleted).toBe(0)
      expect(report.resultWindowsDeleted).toBe(0)
      expect(report.clickHashesCleared).toBe(0)
      expect(report.truncated).toBe(false)
      expect(await db.select().from(rateLimits)).toHaveLength(3)
      expect(await countResultWindows(db)).toBe(4)
      const logged = error.mock.calls.map((call) => call.map((part) => String(part)).join(' ')).join('\n')
      expect(logged).toContain('target')
      expect(logged).not.toContain(prod)
      expect(retentionLogLine(report)).not.toContain('turso')
      const clicksLeft = await db.select().from(clicks)
      expect(clicksLeft.find((row) => row.page === '/tools/chatgpt')?.ipHash).toBe(oldHash)
    } finally {
      await close()
    }
  })

  it('writes nothing when the expected tables are missing', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'bestbotfor-retention-'))
    const client = createClient({ url: `file:${path.join(directory, 'empty.db')}` })
    const db = drizzle(client, { schema: { clicks, rateLimits } })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const report = await runDataRetention(db, { dryRun: false, now, url: `file:${directory}/empty.db`, vercelEnv: 'test' })
      expect(report.wrote).toBe(false)
      expect(report.rateLimitsEligible).toBe(0)
      expect(report.resultWindowsEligible).toBe(0)
      expect(report.clickHashesEligible).toBe(0)
      expect(report.rateLimitsDeleted).toBe(0)
      const logged = error.mock.calls.map((call) => String(call[1])).join('\n')
      expect(logged).toContain('schema')
    } finally {
      client.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('dry-run through the route logs counts and leaves every row', async () => {
    const { db, close } = await seed()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      const response = await handleRetentionCron(request(`Bearer ${secret}`), {
        db: () => db,
        cronSecret: secret,
        env: { purge: 'on', vercelEnv: 'test' },
        now,
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as RetentionReport
      expect(body.dryRun).toBe(true)
      expect(body.wrote).toBe(false)
      expect(body.rateLimitsEligible).toBe(1)
      expect(body.resultWindowsEligible).toBe(2)
      expect(body.resultWindowsDeleted).toBe(0)
      expect(body.clickHashesEligible).toBe(1)
      expect(response.headers.get('cache-control')).toBe('no-store')
      const line = String(log.mock.calls[0]?.[0])
      expect(line).toContain('"event":"data_retention"')
      expect(line).not.toContain(oldHash)
      expect(line).not.toContain(oldKey)
      expect(line).not.toContain(quizExpired)
      expect(line).not.toContain(expiredBucket())
      expect(await countResultWindows(db)).toBe(4)
      const logged = await db.select().from(clicks)
      expect(logged.find((row) => row.page === '/tools/chatgpt')?.ipHash).toBe(oldHash)
    } finally {
      await close()
    }
  })
})

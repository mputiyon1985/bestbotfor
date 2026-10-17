import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestDatabase } from '@/test/db'
import { clicks, rateLimits } from '@/lib/db/schema'
import { DATA_RETENTION_PRODUCTION_LAUNCH } from './retention-flags'
import {
  CLICK_HASH_RETENTION_MS,
  RATE_LIMIT_RETENTION_MS,
  clickHashCutoff,
  cronAuthorized,
  dataRetentionDryRun,
  dataRetentionEnabled,
  decideRetentionRequest,
  rateLimitCutoff,
  retentionLogLine,
  type RetentionReport,
} from './data-retention'
import { handleRetentionCron, runDataRetention } from '@/app/api/cron/data-retention/route'

const now = Date.parse('2026-10-17T20:00:00Z')
const day = 24 * 60 * 60 * 1000
const secret = 'cron-secret-for-tests-only'
const quizKey = 'a'.repeat(64)
const oldKey = 'b'.repeat(64)
const activeKey = 'c'.repeat(64)
const recentKey = 'd'.repeat(64)
const oldHash = 'e'.repeat(64)
const youngHash = 'f'.repeat(64)

function request(authorization: string | null): Request {
  const headers = new Headers()
  if (authorization !== null) headers.set('authorization', authorization)
  return new Request('http://localhost/api/cron/data-retention', { headers })
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

  it('rejects a missing, empty, or wrong cron secret without accepting a shorter prefix', () => {
    expect(cronAuthorized(null, undefined)).toBe(false)
    expect(cronAuthorized(`Bearer ${secret}`, '')).toBe(false)
    expect(cronAuthorized(null, secret)).toBe(false)
    expect(cronAuthorized('Bearer', secret)).toBe(false)
    expect(cronAuthorized(`Bearer ${secret.slice(0, 4)}`, secret)).toBe(false)
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
    expect(clickHashCutoff(now)).toBe(now - CLICK_HASH_RETENTION_MS)
    expect(now - day).not.toBeLessThan(rateLimitCutoff(now))
    expect(now - day - 1).toBeLessThan(rateLimitCutoff(now))
  })
})

describe('data retention job', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function seed() {
    const { db, close } = await createTestDatabase()
    await db.insert(rateLimits).values([
      { key: quizKey, count: 3, resetAt: now - day - 1 },
      { key: oldKey, count: 1, resetAt: now - 2 * day },
      { key: activeKey, count: 2, resetAt: now + day },
      { key: recentKey, count: 4, resetAt: now - day },
    ])
    await db.insert(clicks).values([
      { toolId: 1, page: '/tools/chatgpt', ts: now - CLICK_HASH_RETENTION_MS - 1, country: 'US', ipHash: oldHash },
      { toolId: 1, page: '/tools/claude', ts: now - day, country: 'US', ipHash: youngHash },
      { toolId: 2, page: '/go/chatgpt', ts: now - CLICK_HASH_RETENTION_MS - day, country: null, ipHash: null },
    ])
    return { db, close }
  }

  it('dry-run counts quiz rows and old keys, and writes nothing', async () => {
    const { db, close } = await seed()
    try {
      const report = await runDataRetention(db, { dryRun: true, now })
      expect(report.rateLimitsEligible).toBe(2)
      expect(report.clickHashesEligible).toBe(1)
      expect(report.rateLimitsDeleted).toBe(0)
      expect(report.clickHashesCleared).toBe(0)
      expect(report.wrote).toBe(false)
      const limits = await db.select().from(rateLimits)
      expect(limits).toHaveLength(4)
      const logged = await db.select().from(clicks)
      expect(logged.find((row) => row.page === '/tools/chatgpt')?.ipHash).toBe(oldHash)
      expect(retentionLogLine(report)).not.toContain(quizKey)
      expect(retentionLogLine(report)).not.toContain(oldHash)
    } finally {
      await close()
    }
  })

  it('deletes expired windows, clears old click hashes, and leaves the click rows', async () => {
    const { db, close } = await seed()
    try {
      const report = await runDataRetention(db, { dryRun: false, now, batchSize: 1, maxBatches: 10 })
      expect(report.rateLimitsDeleted).toBe(2)
      expect(report.clickHashesCleared).toBe(1)
      expect(report.wrote).toBe(true)
      expect(report.truncated).toBe(false)
      const limits = await db.select().from(rateLimits)
      expect(limits.map((row) => row.key).sort()).toEqual([activeKey, recentKey].sort())
      const logged = await db.select().from(clicks)
      expect(logged).toHaveLength(3)
      const aged = logged.find((row) => row.page === '/tools/chatgpt')
      expect(aged?.ipHash).toBeNull()
      expect(aged?.toolId).toBe(1)
      expect(logged.find((row) => row.page === '/tools/claude')?.ipHash).toBe(youngHash)
      const again = await runDataRetention(db, { dryRun: false, now })
      expect(again.rateLimitsDeleted).toBe(0)
      expect(again.clickHashesCleared).toBe(0)
      expect(again.wrote).toBe(false)
    } finally {
      await close()
    }
  })

  it('stops at the batch cap and continues on the next run', async () => {
    const { db, close } = await seed()
    try {
      const partial = await runDataRetention(db, { dryRun: false, now, batchSize: 1, maxBatches: 1 })
      expect(partial.rateLimitsDeleted).toBe(1)
      expect(partial.truncated).toBe(true)
      const rest = await runDataRetention(db, { dryRun: false, now, batchSize: 1, maxBatches: 10 })
      expect(rest.rateLimitsDeleted + rest.clickHashesCleared).toBeGreaterThan(0)
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
      expect(logged).not.toContain(quizKey)
      expect(error.mock.calls.join('\n')).not.toContain('Bearer')
      const limits = await db.select().from(rateLimits)
      expect(limits).toHaveLength(4)
    } finally {
      await close()
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
      expect(body.rateLimitsEligible).toBe(2)
      expect(body.clickHashesEligible).toBe(1)
      expect(response.headers.get('cache-control')).toBe('no-store')
      const line = String(log.mock.calls[0]?.[0])
      expect(line).toContain('"event":"data_retention"')
      expect(line).not.toContain(oldHash)
      expect(line).not.toContain(oldKey)
      const logged = await db.select().from(clicks)
      expect(logged.find((row) => row.page === '/tools/chatgpt')?.ipHash).toBe(oldHash)
    } finally {
      await close()
    }
  })
})

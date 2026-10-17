import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { DATA_RETENTION_PRODUCTION_LAUNCH } from './retention-flags'

/** A rate-limit row is eligible once its window has been over for this long. */
export const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000

/** Click ip_hash is cleared once the row is older than this. The row stays. */
export const CLICK_HASH_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

export const RETENTION_BATCH_SIZE = 500
export const RETENTION_MAX_BATCHES = 40

const OPEN_ENVS = new Set(['preview', 'development', 'test'])

export type RetentionEnv = {
  /** DATA_RETENTION_PURGE. Only the exact value "on" enables the job. */
  purge?: string
  /** VERCEL_ENV. Only preview, development, and test are on. Unset and unknown are off. */
  vercelEnv?: string
  /** DATA_RETENTION_DRY_RUN. Only the exact value "off" writes. Unset is a dry run. */
  dryRun?: string
}

export type RetentionReport = {
  event: 'data_retention'
  enabled: boolean
  dryRun: boolean
  wrote: boolean
  rateLimitsEligible: number
  rateLimitsDeleted: number
  resultWindowsEligible: number
  resultWindowsDeleted: number
  clickHashesEligible: number
  clickHashesCleared: number
  truncated: boolean
}

export type RetentionDecision =
  | { ok: false; status: 401; body: { error: 'unauthorized' } }
  | { ok: true; run: false; report: RetentionReport }
  | { ok: true; run: true; dryRun: boolean }

/**
 * Fail closed. True only when DATA_RETENTION_PURGE is exactly "on" and
 * VERCEL_ENV is preview, development, or test. An unset or unknown VERCEL_ENV
 * is off. The Node environment is not consulted. Production stays off unless
 * DATA_RETENTION_PRODUCTION_LAUNCH is true.
 */
export function dataRetentionEnabled(
  env: RetentionEnv,
  productionLaunch: boolean = DATA_RETENTION_PRODUCTION_LAUNCH,
): boolean {
  if (env.purge?.trim() !== 'on') return false
  const vercelEnv = env.vercelEnv?.trim() ?? ''
  if (vercelEnv === 'production') return productionLaunch
  return OPEN_ENVS.has(vercelEnv)
}

/** Dry-run unless the operator sets the exact value "off". */
export function dataRetentionDryRun(env: RetentionEnv): boolean {
  return env.dryRun?.trim() !== 'off'
}

export function rateLimitCutoff(now: number): number {
  return now - RATE_LIMIT_RETENTION_MS
}

/** Quiz /result rows in result_rate_windows use the same 24-hour wait after expires_at. */
export function resultWindowCutoff(now: number): number {
  return now - RATE_LIMIT_RETENTION_MS
}

export function clickHashCutoff(now: number): number {
  return now - CLICK_HASH_RETENTION_MS
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/** Bearer token compared by SHA-256 so a length mismatch cannot throw or leak. */
export function cronAuthorized(authorization: string | null | undefined, secret: string | undefined): boolean {
  const expected = secret ?? ''
  if (expected.length === 0) return false
  const header = authorization ?? ''
  const prefix = 'Bearer '
  if (!header.startsWith(prefix)) return false
  const presented = header.slice(prefix.length)
  if (presented.length === 0) return false
  return timingSafeEqual(digest(presented), digest(expected))
}

export function emptyRetentionReport(enabled: boolean): RetentionReport {
  return {
    event: 'data_retention',
    enabled,
    dryRun: true,
    wrote: false,
    rateLimitsEligible: 0,
    rateLimitsDeleted: 0,
    resultWindowsEligible: 0,
    resultWindowsDeleted: 0,
    clickHashesEligible: 0,
    clickHashesCleared: 0,
    truncated: false,
  }
}

/**
 * Secret first. A bad or missing CRON_SECRET does not reveal whether the flag is on.
 * A disabled job returns counts of zero and does not ask the caller to open the database.
 */
export function decideRetentionRequest(input: {
  authorization: string | null
  cronSecret: string | undefined
  env: RetentionEnv
  productionLaunch?: boolean
}): RetentionDecision {
  if (!cronAuthorized(input.authorization, input.cronSecret)) {
    return { ok: false, status: 401, body: { error: 'unauthorized' } }
  }
  if (!dataRetentionEnabled(input.env, input.productionLaunch)) {
    return { ok: true, run: false, report: emptyRetentionReport(false) }
  }
  return { ok: true, run: true, dryRun: dataRetentionDryRun(input.env) }
}

/** One JSON line. Counts only. Callers must not append keys, hashes, or addresses. */
export function retentionLogLine(report: RetentionReport): string {
  return JSON.stringify(report)
}

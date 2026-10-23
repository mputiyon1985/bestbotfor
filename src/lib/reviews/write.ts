import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { allowRate, type RateLimitDecision } from '@/lib/action-limit'
import type { Database } from '@/lib/db/client'
import {
  moderationEvents,
  reviewAggregates,
  reviewVersions,
  reviews,
  toolVendorDomains,
  tools,
} from '@/lib/db/schema'
import { userRatingsEnabled, type UserRatingsEnv } from '@/lib/flags'
import { rateLimitKey } from '@/lib/ip'
import { K_ip, K_net } from '@/lib/review-hmac-secrets'
import { aggregateFromReviews, type ReviewAggregate } from './aggregate'
import { accountAgeDays, pastReviewWait, vendorDomainDecision } from './eligibility'
import { checkDisplayName, codePointLength, reviewDisplayName, type DisplayNameContext } from './display-name'
import { ipHashes, trustedClientIp, type HeaderSource, type VercelRuntimeEnv } from './ip'
import { linkSignals } from './links'
import { normalizeReviewText } from './normalize'
import { reviewFormSchema, type ReviewFormInput } from './schema'
import { trustTier } from './score'

export const ATTESTATION_VERSION = '2026-10-v1'
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const LIMIT_MS = 800
/**
 * reviews.display_name checks SQLite length() between 1 and 60.
 * checkDisplayName allows 64 code points. A raw name past 60 is refused
 * here so storing it does not need a migration.
 */
const DISPLAY_NAME_COLUMN_MAX = 60

const FORM_FIELDS = new Set([
  'stars',
  'pros',
  'cons',
  'useCaseText',
  'role',
  'usageDuration',
  'planType',
  'connection',
  'connectionText',
  'attestation',
])

export type ReviewPrincipal = {
  userId: string
  emailVerified: boolean
  verifiedEmails: readonly string[]
  createdAtMs: number
  banned: boolean
  staff: boolean
  displayName: string
}

export type ReviewWriteReason =
  | 'flag_off'
  | 'signed_out'
  | 'unverified'
  | 'waiting'
  | 'staff'
  | 'banned'
  | 'vendor_domain'
  | 'name_blocked'
  | 'rate_limited'
  | 'unavailable'
  | 'invalid'
  | 'not_found'

export type ReviewWriteResult =
  | {
      ok: true
      reviewId: number
      status: string
      displayName: string
      created: boolean
    }
  | { ok: false; reason: ReviewWriteReason; retryAt?: number }

type Limiter = (key: string, limit: number, windowMs: number, now: number) => Promise<RateLimitDecision>

export type ReviewWriteDeps = {
  db: Database
  principal: ReviewPrincipal | null
  headers: HeaderSource
  env?: VercelRuntimeEnv & UserRatingsEnv & { reviewIpHmacSecret?: string; reviewIpHmacKeyId?: string; staffUserIds?: string }
  now?: number
  limiter?: Limiter
  revalidate?: (slug: string) => void
  productionLaunch?: boolean
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function parseForm(form: unknown): ReviewFormInput | null {
  if (form === null || typeof form !== 'object' || Array.isArray(form)) return null
  for (const key of Object.keys(form)) {
    if (!FORM_FIELDS.has(key)) return null
  }
  const parsed = reviewFormSchema.safeParse(form)
  return parsed.success ? parsed.data : null
}

async function consume(
  db: Database,
  limiter: Limiter | undefined,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<RateLimitDecision> {
  if (!limiter) return allowRate(db, key, limit, windowMs, { onError: 'closed', now })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      limiter(key, limit, windowMs, now),
      new Promise<RateLimitDecision>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('deadline')), LIMIT_MS)
      }),
    ])
  } catch {
    return 'unavailable'
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function gateLimits(
  deps: ReviewWriteDeps,
  kind: 'submit' | 'edit',
  ip: string,
  now: number,
): Promise<ReviewWriteResult | null> {
  const userKey = kind === 'submit' ? `review:submit:user:${deps.principal?.userId}` : `review:edit:user:${deps.principal?.userId}`
  const userLimit = kind === 'submit' ? 5 : 20
  const checks: [string, number, number][] = [
    [userKey, userLimit, DAY_MS],
    [rateLimitKey(ip, 'review:submit:hour'), 10, HOUR_MS],
    [rateLimitKey(ip, 'review:submit:day'), 30, DAY_MS],
  ]
  for (const [key, limit, windowMs] of checks) {
    const decision = await consume(deps.db, deps.limiter, key, limit, windowMs, now)
    if (decision === 'limit') return { ok: false, reason: 'rate_limited', retryAt: now + windowMs }
    if (decision === 'unavailable') return { ok: false, reason: 'unavailable' }
  }
  return null
}

export async function rebuildReviewAggregate(db: Database, toolId: number, now: number): Promise<ReviewAggregate> {
  const rows = await db
    .select({
      stars: reviewVersions.stars,
      weight: reviews.weight,
      countsTowardScore: reviews.countsTowardScore,
    })
    .from(reviews)
    .innerJoin(reviewVersions, eq(reviewVersions.id, reviews.publishedVersionId))
    .where(and(eq(reviews.toolId, toolId), eq(reviews.status, 'published')))
  const totals = aggregateFromReviews(rows)
  await db
    .insert(reviewAggregates)
    .values({ toolId, ...totals, updatedAt: now })
    .onConflictDoUpdate({ target: reviewAggregates.toolId, set: { ...totals, updatedAt: now } })
  return totals
}

async function audit(
  db: Database,
  input: {
    reviewId: number
    versionId: number | null
    userId: string
    action: string
    fromStatus: string | null
    toStatus: string
    note: string
    now: number
  },
): Promise<void> {
  const hash = hashText(`${input.action}|${input.reviewId}|${input.versionId ?? ''}|${input.toStatus}|${input.now}`)
  await db.insert(moderationEvents).values({
    reviewId: input.reviewId,
    versionId: input.versionId,
    actorType: 'user',
    actorRef: input.userId,
    action: input.action,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    note: input.note.slice(0, 500),
    createdAt: input.now,
    hash,
  })
}

function hintNote(text: string, ownDomains: readonly string[], competitorDomains: readonly string[]): string {
  const hints = linkSignals(text, { ownDomains, competitorDomains })
  return hints.length > 0 ? hints.join(', ') : ''
}

function acceptedDisplayName(
  name: string,
  context: DisplayNameContext,
): { ok: true; name: string } | { ok: false } {
  const raw = reviewDisplayName(name)
  if (!checkDisplayName(raw, context).ok) return { ok: false }
  if (codePointLength(raw) < 1 || codePointLength(raw) > DISPLAY_NAME_COLUMN_MAX) return { ok: false }
  return { ok: true, name: raw }
}

function isUniqueConstraint(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return true
  const message = error instanceof Error ? error.message : ''
  return /unique constraint failed/i.test(message)
}

async function toolRow(db: Database, slug: string) {
  const [tool] = await db.select().from(tools).where(eq(tools.slug, slug)).limit(1)
  return tool ?? null
}

function blocked(principal: ReviewPrincipal, now: number, staffIds: string): ReviewWriteReason | null {
  if (!principal.userId) return 'signed_out'
  if (principal.banned) return 'banned'
  if (principal.staff || staffIds.split(',').some((id) => id.trim() === principal.userId)) return 'staff'
  if (!principal.emailVerified) return 'unverified'
  if (!pastReviewWait(principal.createdAtMs, now)) return 'waiting'
  return null
}

async function prepare(
  deps: ReviewWriteDeps,
  kind: 'submit' | 'edit',
): Promise<{ principal: ReviewPrincipal; now: number; ipHmac: string; netHmac: string; ipKeyId: string } | ReviewWriteResult> {
  const env = deps.env ?? {}
  if (!userRatingsEnabled(env, deps.productionLaunch)) return { ok: false, reason: 'flag_off' }
  const principal = deps.principal
  if (!principal?.userId) return { ok: false, reason: 'signed_out' }
  const now = deps.now ?? Date.now()
  const reason = blocked(principal, now, env.staffUserIds ?? process.env.REVIEW_STAFF_USER_IDS ?? '')
  if (reason) return { ok: false, reason }
  const ip = trustedClientIp(deps.headers, env)
  if (!ip) {
    console.error('review write unavailable')
    return { ok: false, reason: 'unavailable' }
  }
  const secret = env.reviewIpHmacSecret ?? process.env.REVIEW_IP_HMAC_SECRET ?? ''
  const keyId = env.reviewIpHmacKeyId ?? process.env.REVIEW_IP_HMAC_KEY_ID ?? ''
  let hashes
  try {
    hashes = ipHashes(ip, { ipKey: K_ip(secret), netKey: K_net(secret), keyId })
  } catch {
    console.error('review write unavailable')
    return { ok: false, reason: 'unavailable' }
  }
  if (!hashes || !/^k[1-9][0-9]{0,3}$/.test(keyId)) {
    console.error('review write unavailable')
    return { ok: false, reason: 'unavailable' }
  }
  const limited = await gateLimits(deps, kind, ip, now)
  if (limited) return limited
  return { principal, now, ipHmac: hashes.ipHmac, netHmac: hashes.netHmac, ipKeyId: hashes.ipKeyId }
}

export async function submitReview(deps: ReviewWriteDeps, toolSlug: string, form: unknown): Promise<ReviewWriteResult> {
  const ready = await prepare(deps, 'submit')
  if ('ok' in ready) return ready
  const parsed = parseForm(form)
  if (!parsed) return { ok: false, reason: 'invalid' }
  const tool = await toolRow(deps.db, toolSlug)
  if (!tool) return { ok: false, reason: 'not_found' }
  const domains = await deps.db.select().from(toolVendorDomains).where(eq(toolVendorDomains.toolId, tool.id))
  const vendor = vendorDomainDecision(
    ready.principal.verifiedEmails,
    domains.map((row) => row.domain),
  )
  if (vendor === 'match') return { ok: false, reason: 'vendor_domain' }
  const display = acceptedDisplayName(ready.principal.displayName, {
    toolNames: [tool.name],
    vendorNames: [tool.vendor],
  })
  if (!display.ok) return { ok: false, reason: 'name_blocked' }
  const displayName = display.name
  const published = await deps.db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.clerkUserId, ready.principal.userId), eq(reviews.status, 'published')))
  const tier = trustTier({
    emailVerified: true,
    pastWaitingPeriod: true,
    accountAgeDays: accountAgeDays(ready.principal.createdAtMs, ready.now),
    otherPublishedReviews: published.length,
    upheldModerationIn180Days: false,
  })
  const weight = tier.weight ?? 1
  const countsTowardScore = parsed.connection === 'disclosed' ? 0 : 1
  const pros = normalizeReviewText(parsed.pros)
  const cons = normalizeReviewText(parsed.cons)
  const useCaseText = normalizeReviewText(parsed.useCaseText)
  const connectionText = parsed.connection === 'disclosed' ? normalizeReviewText(parsed.connectionText) : ''
  const contentHash = hashText(`${parsed.stars}|${pros}|${cons}|${useCaseText}|${parsed.connection}|${connectionText}`)
  const note = hintNote([pros, cons, useCaseText, connectionText].join('\n'), domains.map((row) => row.domain), [])
  try {
    const reviewId = await deps.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(reviews)
        .where(and(eq(reviews.clerkUserId, ready.principal.userId), eq(reviews.toolId, tool.id)))
        .limit(1)
      if (existing) return { id: existing.id, created: false }
      const [review] = await tx
        .insert(reviews)
        .values({
          toolId: tool.id,
          clerkUserId: ready.principal.userId,
          status: 'pending',
          latestVersionId: 0,
          weight,
          countsTowardScore,
          displayName,
          ipHmac: ready.ipHmac,
          netHmac: ready.netHmac,
          ipKeyId: ready.ipKeyId,
          createdAt: ready.now,
          updatedAt: ready.now,
        })
        .returning()
      if (!review) throw new Error('review insert failed')
      const [version] = await tx
        .insert(reviewVersions)
        .values({
          reviewId: review.id,
          versionNo: 1,
          stars: parsed.stars,
          pros,
          cons,
          useCaseText,
          role: parsed.role ?? null,
          usageDuration: parsed.usageDuration ?? null,
          planType: parsed.planType ?? null,
          connection: parsed.connection,
          connectionText,
          attestationVersion: ATTESTATION_VERSION,
          vendorDomainCheck: vendor,
          decision: 'pending',
          contentHash,
          createdAt: ready.now,
        })
        .returning()
      if (!version) throw new Error('version insert failed')
      await tx.update(reviews).set({ latestVersionId: version.id }).where(eq(reviews.id, review.id))
      await tx.insert(moderationEvents).values({
        reviewId: review.id,
        versionId: version.id,
        actorType: 'user',
        actorRef: ready.principal.userId,
        action: 'submit',
        fromStatus: null,
        toStatus: 'pending',
        note: note.slice(0, 500),
        createdAt: ready.now,
        hash: hashText(`submit|${review.id}|${version.id}|pending|${ready.now}`),
      })
      await rebuildReviewAggregate(tx as unknown as Database, tool.id, ready.now)
      return { id: review.id, created: true }
    })
    const [stored] = await deps.db.select().from(reviews).where(eq(reviews.id, reviewId.id)).limit(1)
    return {
      ok: true,
      reviewId: reviewId.id,
      status: stored?.status ?? 'pending',
      displayName: stored?.displayName ?? displayName,
      created: reviewId.created,
    }
  } catch (error) {
    if (isUniqueConstraint(error)) {
      const [existing] = await deps.db
        .select()
        .from(reviews)
        .where(and(eq(reviews.clerkUserId, ready.principal.userId), eq(reviews.toolId, tool.id)))
        .limit(1)
      if (existing) return { ok: true, reviewId: existing.id, status: existing.status, displayName: existing.displayName, created: false }
    }
    console.error('review write failed', error instanceof Error ? error.name : 'error')
    return { ok: false, reason: 'unavailable' }
  }
}

export async function editReview(deps: ReviewWriteDeps, toolSlug: string, form: unknown): Promise<ReviewWriteResult> {
  const ready = await prepare(deps, 'edit')
  if ('ok' in ready) return ready
  const parsed = parseForm(form)
  if (!parsed) return { ok: false, reason: 'invalid' }
  const tool = await toolRow(deps.db, toolSlug)
  if (!tool) return { ok: false, reason: 'not_found' }
  const display = acceptedDisplayName(ready.principal.displayName, {
    toolNames: [tool.name],
    vendorNames: [tool.vendor],
  })
  if (!display.ok) return { ok: false, reason: 'name_blocked' }
  const displayName = display.name
  const [existing] = await deps.db
    .select()
    .from(reviews)
    .where(and(eq(reviews.clerkUserId, ready.principal.userId), eq(reviews.toolId, tool.id)))
    .limit(1)
  if (!existing) return { ok: false, reason: 'not_found' }
  const domains = await deps.db.select().from(toolVendorDomains).where(eq(toolVendorDomains.toolId, tool.id))
  const vendor = vendorDomainDecision(ready.principal.verifiedEmails, domains.map((row) => row.domain))
  if (vendor === 'match') return { ok: false, reason: 'vendor_domain' }
  const versions = await deps.db.select().from(reviewVersions).where(eq(reviewVersions.reviewId, existing.id))
  const nextNo = versions.reduce((max, row) => Math.max(max, row.versionNo), 0) + 1
  const pros = normalizeReviewText(parsed.pros)
  const cons = normalizeReviewText(parsed.cons)
  const useCaseText = normalizeReviewText(parsed.useCaseText)
  const connectionText = parsed.connection === 'disclosed' ? normalizeReviewText(parsed.connectionText) : ''
  const countsTowardScore = parsed.connection === 'disclosed' ? 0 : 1
  const note = hintNote([pros, cons, useCaseText, connectionText].join('\n'), domains.map((row) => row.domain), [])
  await deps.db.transaction(async (tx) => {
    const [version] = await tx
      .insert(reviewVersions)
      .values({
        reviewId: existing.id,
        versionNo: nextNo,
        stars: parsed.stars,
        pros,
        cons,
        useCaseText,
        role: parsed.role ?? null,
        usageDuration: parsed.usageDuration ?? null,
        planType: parsed.planType ?? null,
        connection: parsed.connection,
        connectionText,
        attestationVersion: ATTESTATION_VERSION,
        vendorDomainCheck: vendor,
        decision: 'pending',
        contentHash: hashText(`${parsed.stars}|${pros}|${cons}|${useCaseText}|${parsed.connection}|${connectionText}`),
        createdAt: ready.now,
      })
      .returning()
    if (!version) throw new Error('version insert failed')
    await tx
      .update(reviews)
      .set({
        latestVersionId: version.id,
        displayName,
        countsTowardScore,
        ipHmac: ready.ipHmac,
        netHmac: ready.netHmac,
        ipKeyId: ready.ipKeyId,
        updatedAt: ready.now,
      })
      .where(eq(reviews.id, existing.id))
    await audit(tx as unknown as Database, {
      reviewId: existing.id,
      versionId: version.id,
      userId: ready.principal.userId,
      action: 'edit',
      fromStatus: existing.status,
      toStatus: existing.status,
      note,
      now: ready.now,
    })
    await rebuildReviewAggregate(tx as unknown as Database, tool.id, ready.now)
  })
  return { ok: true, reviewId: existing.id, status: existing.status, displayName, created: false }
}

export async function deleteReview(deps: ReviewWriteDeps, toolSlug: string): Promise<ReviewWriteResult> {
  const env = deps.env ?? {}
  if (!userRatingsEnabled(env, deps.productionLaunch)) return { ok: false, reason: 'flag_off' }
  const principal = deps.principal
  if (!principal?.userId) return { ok: false, reason: 'signed_out' }
  const now = deps.now ?? Date.now()
  const tool = await toolRow(deps.db, toolSlug)
  if (!tool) return { ok: false, reason: 'not_found' }
  const [existing] = await deps.db
    .select()
    .from(reviews)
    .where(and(eq(reviews.clerkUserId, principal.userId), eq(reviews.toolId, tool.id)))
    .limit(1)
  if (!existing) return { ok: false, reason: 'not_found' }
  await deps.db.transaction(async (tx) => {
    await tx.update(reviews).set({ status: 'withdrawn', updatedAt: now }).where(eq(reviews.id, existing.id))
    await audit(tx as unknown as Database, {
      reviewId: existing.id,
      versionId: existing.latestVersionId,
      userId: principal.userId,
      action: 'delete',
      fromStatus: existing.status,
      toStatus: 'withdrawn',
      note: 'purge_scheduled',
      now,
    })
    await rebuildReviewAggregate(tx as unknown as Database, tool.id, now)
  })
  deps.revalidate?.(`reviews:${tool.slug}`)
  deps.revalidate?.(`/tools/${tool.slug}`)
  return { ok: true, reviewId: existing.id, status: 'withdrawn', displayName: existing.displayName, created: false }
}

import { createHash } from 'node:crypto'
import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { StepUpDecision } from './admin'
import type { Database } from './db/client'
import { sponsorshipCreatives, sponsorshipRefundEvents, sponsorshipReviewEvents, sponsorships } from './db/schema'
import { sanitizeSponsorCompany, sponsorTextHadInvisible } from './sponsor-company'
import { stripSponsorLogoMetadata } from './sponsor-logo'
import { SPONSOR_LOGO_MAX_BYTES } from './sponsor-offerings'
import type { VerifiedSponsorCheckout } from './sponsor-session'

export { SPONSOR_REFUND_NOTE, SPONSOR_REVIEW_NOTICE } from './sponsor-offerings'
export { SPONSOR_LOGO_MAX_BYTES } from './sponsor-offerings'

export const SPONSOR_CARD_NAME_MIN = 2
export const SPONSOR_CARD_NAME_MAX = 60
export const SPONSOR_CARD_DESCRIPTION_MIN = 12
export const SPONSOR_CARD_DESCRIPTION_MAX = 140
export const SPONSOR_CARD_URL_MAX = 300
export const SPONSOR_REVIEW_REASON_MAX = 500
export const SPONSOR_RESUBMISSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
export const SPONSOR_CARD_CHANGED =
  'That tool card changed since you opened it. Refresh and review the current version.'
export const SPONSOR_CARD_CLOSED = 'This tool card can no longer be edited.'
export const SPONSOR_RESUBMIT_CLOSED = 'The resubmission window has ended.'

const LOGO_MESSAGE = 'Upload a PNG, JPEG, or WebP logo under 64 KB.'
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const NOT_WAITING = 'That tool card is not waiting for review.'

export type SponsorLogo = {
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
  bytes: Buffer
}

export type ValidSponsorCard = {
  toolName: string
  description: string
  url: string
  logo: SponsorLogo
  hadInvisible: boolean
}

export type PublicSponsorCard = {
  name: string
  description: string
  url: string
  logoSrc: string
}

type CardResult = { ok: true; card: ValidSponsorCard } | { ok: false; message: string }

function logoMagic(mime: string, bytes: Buffer): boolean {
  if (mime === 'image/png') {
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  }
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mime === 'image/webp') {
    return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  }
  return false
}

function isIpLiteral(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host.includes(':')) return true
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return true
  if (/^(?:0x[0-9a-f]+\.){3}0x[0-9a-f]+$/i.test(host)) return true
  return false
}

function isBlockedSponsorHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localdomain')) return true
  return isIpLiteral(host)
}

export function parseSponsorHttpsUrl(raw: string): string | null {
  const stripped = sanitizeSponsorCompany(raw)
  if (stripped.length < 12 || stripped.length > SPONSOR_CARD_URL_MAX) return null
  if (/[\s<>]/.test(stripped)) return null
  let url: URL
  try {
    url = new URL(stripped)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  if (isBlockedSponsorHost(url.hostname)) return null
  return url.href
}

export function parseSponsorLogo(mime: string, bytes: Buffer): SponsorLogo | null {
  if (!LOGO_TYPES.has(mime)) return null
  const stripped = stripSponsorLogoMetadata(mime, bytes)
  if (!stripped || stripped.length < 4 || stripped.length > SPONSOR_LOGO_MAX_BYTES) return null
  if (!logoMagic(mime, stripped)) return null
  return { mime: mime as SponsorLogo['mime'], bytes: stripped }
}

export function sponsorCardContentHash(card: {
  toolName: string
  description: string
  url: string
  logoMime: string
  logoBytes: Buffer
}): string {
  return createHash('sha256')
    .update(card.toolName)
    .update('\0')
    .update(card.description)
    .update('\0')
    .update(card.url)
    .update('\0')
    .update(card.logoMime)
    .update('\0')
    .update(card.logoBytes)
    .digest('hex')
}

export function parseSponsorCardFields(input: {
  toolName: string
  description: string
  url: string
  logoMime: string
  logoBytes: Buffer
}): CardResult {
  const hadInvisible = sponsorTextHadInvisible(input.toolName) || sponsorTextHadInvisible(input.description)
  const toolName = sanitizeSponsorCompany(input.toolName)
  if (toolName.length < SPONSOR_CARD_NAME_MIN || toolName.length > SPONSOR_CARD_NAME_MAX || /[<>]/.test(toolName)) {
    return { ok: false, message: 'Enter the tool name.' }
  }
  const description = sanitizeSponsorCompany(input.description)
  if (
    description.length < SPONSOR_CARD_DESCRIPTION_MIN ||
    description.length > SPONSOR_CARD_DESCRIPTION_MAX ||
    /[<>]/.test(description)
  ) {
    return { ok: false, message: 'Enter a one-line description.' }
  }
  const url = parseSponsorHttpsUrl(input.url)
  if (!url) return { ok: false, message: 'Enter an https URL for the tool.' }
  const logo = parseSponsorLogo(input.logoMime, input.logoBytes)
  if (!logo) return { ok: false, message: LOGO_MESSAGE }
  return { ok: true, card: { toolName, description, url, logo, hadInvisible } }
}

function asBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  return null
}

export async function readSponsorCardForm(formData: FormData): Promise<CardResult> {
  const logo = formData.get('logo')
  if (!logo || typeof logo !== 'object' || !('arrayBuffer' in logo) || !('type' in logo) || !('size' in logo)) {
    return { ok: false, message: LOGO_MESSAGE }
  }
  const file = logo as { type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }
  if (file.size > SPONSOR_LOGO_MAX_BYTES) return { ok: false, message: LOGO_MESSAGE }
  const bytes = Buffer.from(await file.arrayBuffer())
  return parseSponsorCardFields({
    toolName: String(formData.get('tool_name') ?? ''),
    description: String(formData.get('tool_description') ?? ''),
    url: String(formData.get('tool_url') ?? ''),
    logoMime: file.type,
    logoBytes: bytes,
  })
}

/** Rebuild a public card from stored fields. Invalid or unapproved rows return null. */
export function toPublicSponsorCard(input: {
  status: string
  toolName: string
  description: string
  url: string
  logoMime: string
  logoBytes: Uint8Array | Buffer
}): PublicSponsorCard | null {
  if (input.status !== 'approved') return null
  const bytes = asBuffer(input.logoBytes)
  if (!bytes) return null
  const parsed = parseSponsorCardFields({
    toolName: input.toolName,
    description: input.description,
    url: input.url,
    logoMime: input.logoMime,
    logoBytes: bytes,
  })
  if (!parsed.ok) return null
  return {
    name: parsed.card.toolName,
    description: parsed.card.description,
    url: parsed.card.url,
    logoSrc: `data:${parsed.card.logo.mime};base64,${parsed.card.logo.bytes.toString('base64')}`,
  }
}

function cardValues(card: ValidSponsorCard, now: number) {
  return {
    toolName: card.toolName,
    description: card.description,
    url: card.url,
    logoMime: card.logo.mime,
    logoBytes: card.logo.bytes,
    contentHash: sponsorCardContentHash({
      toolName: card.toolName,
      description: card.description,
      url: card.url,
      logoMime: card.logo.mime,
      logoBytes: card.logo.bytes,
    }),
    hadInvisible: card.hadInvisible ? 1 : 0,
    updatedAt: now,
  }
}

/** Checkout stores one pending card per form request. A retry updates that row only while it is pending. */
export async function savePendingSponsorCard(
  db: Database,
  input: { requestKey: string; card: ValidSponsorCard; now: number },
): Promise<{ ok: true; id: number } | { ok: false; message: string }> {
  const values = cardValues(input.card, input.now)
  const inserted = await db
    .insert(sponsorshipCreatives)
    .values({
      ...values,
      requestKey: input.requestKey,
      status: 'pending',
      version: 1,
      resubmissionCount: 0,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: sponsorshipCreatives.requestKey,
      set: {
        ...values,
        version: sql`${sponsorshipCreatives.version} + 1`,
      },
      setWhere: eq(sponsorshipCreatives.status, 'pending'),
    })
    .returning({ id: sponsorshipCreatives.id })
  const id = inserted[0]?.id
  if (!id) return { ok: false, message: 'This tool card was already reviewed.' }
  return { ok: true, id }
}

/** After payment, store a new card, replace a pending one, or accept the one resubmission. */
export async function saveSponsorCardForSession(
  db: Database,
  input: { card: ValidSponsorCard; now: number; checkout: VerifiedSponsorCheckout },
): Promise<{ ok: true } | { ok: false; message: string }> {
  await expireSponsorResubmissions(db, input.now)
  const sessionId = input.checkout.sessionId
  const sponsorship = await db
    .select({
      id: sponsorships.id,
      status: sponsorships.status,
      offering: sponsorships.offering,
      taskSlug: sponsorships.taskSlug,
      refundedAt: sponsorships.refundedAt,
    })
    .from(sponsorships)
    .where(eq(sponsorships.stripeCheckoutSessionId, sessionId))
  const paid = sponsorship[0]
  if (paid) {
    const matches =
      paid.status === 'paid' &&
      paid.refundedAt == null &&
      paid.offering === input.checkout.offering &&
      paid.taskSlug === input.checkout.taskSlug
    if (!matches) return { ok: false, message: 'That checkout session is not a paid placement.' }
  }
  const existing = await db
    .select({
      id: sponsorshipCreatives.id,
      status: sponsorshipCreatives.status,
      refundStatus: sponsorshipCreatives.refundStatus,
      resubmissionCount: sponsorshipCreatives.resubmissionCount,
      rejectedAt: sponsorshipCreatives.rejectedAt,
    })
    .from(sponsorshipCreatives)
    .where(
      paid
        ? or(eq(sponsorshipCreatives.stripeCheckoutSessionId, sessionId), eq(sponsorshipCreatives.sponsorshipId, paid.id))
        : eq(sponsorshipCreatives.stripeCheckoutSessionId, sessionId),
    )
  const row = existing[0]
  const values = cardValues(input.card, input.now)
  if (!row) {
    const inserted = await db
      .insert(sponsorshipCreatives)
      .values({
        ...values,
        requestKey: `session:${sessionId}`,
        stripeCheckoutSessionId: sessionId,
        sponsorshipId: paid?.id ?? null,
        status: 'pending',
        version: 1,
        resubmissionCount: 0,
        createdAt: input.now,
      })
      .onConflictDoUpdate({
        target: sponsorshipCreatives.requestKey,
        set: {
          ...values,
          stripeCheckoutSessionId: sessionId,
          sponsorshipId: paid?.id ?? null,
          version: sql`${sponsorshipCreatives.version} + 1`,
        },
        setWhere: eq(sponsorshipCreatives.status, 'pending'),
      })
      .returning({ id: sponsorshipCreatives.id })
    if (!inserted[0]) return { ok: false, message: SPONSOR_CARD_CLOSED }
    return { ok: true }
  }
  if (row.status === 'approved' || row.refundStatus === 'refunded') return { ok: false, message: SPONSOR_CARD_CLOSED }
  if (row.refundStatus === 'refund_pending') return { ok: false, message: SPONSOR_RESUBMIT_CLOSED }
  if (row.status === 'pending') {
    const updated = await db
      .update(sponsorshipCreatives)
      .set({
        ...values,
        stripeCheckoutSessionId: sessionId,
        sponsorshipId: paid?.id ?? null,
        version: sql`${sponsorshipCreatives.version} + 1`,
      })
      .where(and(eq(sponsorshipCreatives.id, row.id), eq(sponsorshipCreatives.status, 'pending')))
      .returning({ id: sponsorshipCreatives.id })
    if (updated.length === 0) return { ok: false, message: SPONSOR_CARD_CLOSED }
    return { ok: true }
  }
  const windowOpen =
    row.status === 'rejected' &&
    row.resubmissionCount === 0 &&
    row.rejectedAt != null &&
    row.rejectedAt > input.now - SPONSOR_RESUBMISSION_WINDOW_MS
  if (!windowOpen) return { ok: false, message: SPONSOR_RESUBMIT_CLOSED }
  const resubmitted = await db
    .update(sponsorshipCreatives)
    .set({
      ...values,
      status: 'pending',
      resubmissionCount: 1,
      stripeCheckoutSessionId: sessionId,
      sponsorshipId: paid?.id ?? null,
      version: sql`${sponsorshipCreatives.version} + 1`,
    })
    .where(
      and(
        eq(sponsorshipCreatives.id, row.id),
        eq(sponsorshipCreatives.status, 'rejected'),
        isNull(sponsorshipCreatives.refundStatus),
        eq(sponsorshipCreatives.resubmissionCount, 0),
        gt(sponsorshipCreatives.rejectedAt, input.now - SPONSOR_RESUBMISSION_WINDOW_MS),
      ),
    )
    .returning({ id: sponsorshipCreatives.id })
  if (resubmitted.length === 0) return { ok: false, message: SPONSOR_RESUBMIT_CLOSED }
  return { ok: true }
}

/** Webhook attaches the checkout card to the paid sponsorship. It does not approve it. */
export async function linkSponsorCreative(
  db: Database,
  input: { creativeId: string | undefined; sessionId: string; now: number },
): Promise<void> {
  const sponsorship = await db
    .select({ id: sponsorships.id })
    .from(sponsorships)
    .where(eq(sponsorships.stripeCheckoutSessionId, input.sessionId))
  const sponsorshipId = sponsorship[0]?.id
  if (!sponsorshipId) return
  const creativeId = Number(input.creativeId)
  if (Number.isInteger(creativeId) && creativeId > 0) {
    await db
      .update(sponsorshipCreatives)
      .set({ sponsorshipId, stripeCheckoutSessionId: input.sessionId, updatedAt: input.now })
      .where(
        and(
          eq(sponsorshipCreatives.id, creativeId),
          or(isNull(sponsorshipCreatives.sponsorshipId), eq(sponsorshipCreatives.sponsorshipId, sponsorshipId)),
        ),
      )
  }
  await db
    .update(sponsorshipCreatives)
    .set({ sponsorshipId, updatedAt: input.now })
    .where(and(eq(sponsorshipCreatives.stripeCheckoutSessionId, input.sessionId), isNull(sponsorshipCreatives.sponsorshipId)))
}

export async function approvedCardsForSponsorships(
  db: Database,
  sponsorshipIds: number[],
): Promise<Map<number, PublicSponsorCard>> {
  const found = new Map<number, PublicSponsorCard>()
  if (sponsorshipIds.length === 0) return found
  const rows = await db
    .select({
      sponsorshipId: sponsorshipCreatives.sponsorshipId,
      approvedToolName: sponsorshipCreatives.approvedToolName,
      approvedDescription: sponsorshipCreatives.approvedDescription,
      approvedUrl: sponsorshipCreatives.approvedUrl,
      approvedLogoMime: sponsorshipCreatives.approvedLogoMime,
      approvedLogoBytes: sponsorshipCreatives.approvedLogoBytes,
      updatedAt: sponsorshipCreatives.updatedAt,
    })
    .from(sponsorshipCreatives)
    .where(and(inArray(sponsorshipCreatives.sponsorshipId, sponsorshipIds), eq(sponsorshipCreatives.status, 'approved')))
    .orderBy(desc(sponsorshipCreatives.updatedAt))
  for (const row of rows) {
    if (row.sponsorshipId == null || found.has(row.sponsorshipId)) continue
    if (!row.approvedToolName || !row.approvedDescription || !row.approvedUrl || !row.approvedLogoMime) continue
    const bytes = asBuffer(row.approvedLogoBytes)
    if (!bytes) continue
    const card = toPublicSponsorCard({
      status: 'approved',
      toolName: row.approvedToolName,
      description: row.approvedDescription,
      url: row.approvedUrl,
      logoMime: row.approvedLogoMime,
      logoBytes: bytes,
    })
    if (card) found.set(row.sponsorshipId, card)
  }
  return found
}

function reviewReason(decision: 'approved' | 'rejected', raw: string): string | null {
  const reason = sanitizeSponsorCompany(raw)
  if (/[<>]/.test(reason)) return null
  if (decision === 'rejected') {
    if (reason.length < 3 || reason.length > SPONSOR_REVIEW_REASON_MAX) return null
    return reason
  }
  if (reason.length === 0) return 'Approved.'
  if (reason.length > SPONSOR_REVIEW_REASON_MAX) return null
  return reason
}

export async function recordSponsorCardReview(
  db: Database,
  input: {
    actorId: string
    creativeId: number
    decision: 'approved' | 'rejected'
    reason: string
    now: number
    version: number
    updatedAt: number
    contentHash: string
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const actorId = sanitizeSponsorCompany(input.actorId)
  if (actorId.length < 1 || actorId.length > 200) return { ok: false, message: NOT_WAITING }
  const reason = reviewReason(input.decision, input.reason)
  if (!reason) {
    return {
      ok: false,
      message: input.decision === 'rejected' ? 'Enter a reason for the rejection.' : 'Enter a shorter reason.',
    }
  }
  const existing = await db
    .select({
      id: sponsorshipCreatives.id,
      status: sponsorshipCreatives.status,
      sponsorshipId: sponsorshipCreatives.sponsorshipId,
      version: sponsorshipCreatives.version,
      updatedAt: sponsorshipCreatives.updatedAt,
      contentHash: sponsorshipCreatives.contentHash,
      resubmissionCount: sponsorshipCreatives.resubmissionCount,
      toolName: sponsorshipCreatives.toolName,
      description: sponsorshipCreatives.description,
      url: sponsorshipCreatives.url,
      logoMime: sponsorshipCreatives.logoMime,
      logoBytes: sponsorshipCreatives.logoBytes,
    })
    .from(sponsorshipCreatives)
    .where(eq(sponsorshipCreatives.id, input.creativeId))
  const row = existing[0]
  if (!row || row.status !== 'pending') return { ok: false, message: NOT_WAITING }
  if (row.version !== input.version || row.updatedAt !== input.updatedAt || row.contentHash !== input.contentHash) {
    return { ok: false, message: SPONSOR_CARD_CHANGED }
  }
  const bytes = asBuffer(row.logoBytes)
  if (!bytes) return { ok: false, message: NOT_WAITING }
  const refundPending = input.decision === 'rejected' && row.resubmissionCount >= 1
  const updated = await db
    .update(sponsorshipCreatives)
    .set({
      status: input.decision,
      updatedAt: input.now,
      rejectedAt: input.decision === 'rejected' ? input.now : undefined,
      refundStatus: refundPending ? 'refund_pending' : undefined,
      approvedToolName: input.decision === 'approved' ? row.toolName : undefined,
      approvedDescription: input.decision === 'approved' ? row.description : undefined,
      approvedUrl: input.decision === 'approved' ? row.url : undefined,
      approvedLogoMime: input.decision === 'approved' ? row.logoMime : undefined,
      approvedLogoBytes: input.decision === 'approved' ? bytes : undefined,
      approvedContentHash: input.decision === 'approved' ? row.contentHash : undefined,
      approvedVersion: input.decision === 'approved' ? row.version : undefined,
    })
    .where(
      and(
        eq(sponsorshipCreatives.id, row.id),
        eq(sponsorshipCreatives.status, 'pending'),
        eq(sponsorshipCreatives.version, input.version),
        eq(sponsorshipCreatives.updatedAt, input.updatedAt),
        eq(sponsorshipCreatives.contentHash, input.contentHash),
      ),
    )
    .returning({ id: sponsorshipCreatives.id, sponsorshipId: sponsorshipCreatives.sponsorshipId })
  if (updated.length === 0) return { ok: false, message: SPONSOR_CARD_CHANGED }
  await db.insert(sponsorshipReviewEvents).values({
    creativeId: row.id,
    sponsorshipId: row.sponsorshipId,
    actor: actorId,
    decision: input.decision,
    reason,
    contentHash: input.contentHash,
    version: input.version,
    createdAt: input.now,
  })
  if (refundPending) {
    await db.insert(sponsorshipRefundEvents).values({
      creativeId: row.id,
      sponsorshipId: updated[0]?.sponsorshipId ?? row.sponsorshipId,
      actor: actorId,
      decision: 'refund_pending',
      reason: 'Rejected again. Refund the payment in the Stripe dashboard.',
      createdAt: input.now,
    })
  }
  return { ok: true }
}

/** Move a first rejection to refund_pending once the 7-day window has ended. */
export async function expireSponsorResubmissions(db: Database, now: number): Promise<void> {
  const expired = await db
    .update(sponsorshipCreatives)
    .set({ refundStatus: 'refund_pending', updatedAt: now })
    .where(
      and(
        eq(sponsorshipCreatives.status, 'rejected'),
        isNull(sponsorshipCreatives.refundStatus),
        eq(sponsorshipCreatives.resubmissionCount, 0),
        lte(sponsorshipCreatives.rejectedAt, now - SPONSOR_RESUBMISSION_WINDOW_MS),
      ),
    )
    .returning({ id: sponsorshipCreatives.id, sponsorshipId: sponsorshipCreatives.sponsorshipId })
  for (const row of expired) {
    await db.insert(sponsorshipRefundEvents).values({
      creativeId: row.id,
      sponsorshipId: row.sponsorshipId,
      actor: 'system',
      decision: 'refund_pending',
      reason: 'The 7-day resubmission window ended.',
      createdAt: now,
    })
  }
}

export async function markSponsorRefunded(
  db: Database,
  input: { actorId: string; creativeId: number; reason: string; now: number },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const actorId = sanitizeSponsorCompany(input.actorId)
  if (actorId.length < 1 || actorId.length > 200) return { ok: false, message: 'That card is not waiting for a refund.' }
  const trimmed = sanitizeSponsorCompany(input.reason)
  if (/[<>]/.test(trimmed)) return { ok: false, message: 'Enter a shorter reason.' }
  const reason = trimmed.length === 0 ? 'Refunded in the Stripe dashboard.' : trimmed
  if (reason.length < 3 || reason.length > SPONSOR_REVIEW_REASON_MAX) {
    return { ok: false, message: 'Enter a shorter reason.' }
  }
  const updated = await db
    .update(sponsorshipCreatives)
    .set({ refundStatus: 'refunded', updatedAt: input.now })
    .where(and(eq(sponsorshipCreatives.id, input.creativeId), eq(sponsorshipCreatives.refundStatus, 'refund_pending')))
    .returning({ id: sponsorshipCreatives.id, sponsorshipId: sponsorshipCreatives.sponsorshipId })
  if (updated.length === 0) return { ok: false, message: 'That card is not waiting for a refund.' }
  await db.insert(sponsorshipRefundEvents).values({
    creativeId: input.creativeId,
    sponsorshipId: updated[0]?.sponsorshipId ?? null,
    actor: actorId,
    decision: 'refunded',
    reason,
    createdAt: input.now,
  })
  return { ok: true }
}

/** Step-up failures write nothing. The caller still has to use requireAdminStepUp(). */
export async function reviewSponsorCardIfAllowed(
  db: Database,
  access: StepUpDecision,
  review: {
    creativeId: number
    decision: 'approved' | 'rejected'
    reason: string
    now: number
    version: number
    updatedAt: number
    contentHash: string
  },
): Promise<
  | { ok: true }
  | {
      ok: false
      reason: 'signed-out' | 'not-admin' | 'mfa-required' | 'reverification' | 'invalid'
      message?: string
    }
> {
  if (!access.ok) return { ok: false, reason: access.reason }
  const result = await recordSponsorCardReview(db, { ...review, actorId: access.userId })
  if (!result.ok) return { ok: false, reason: 'invalid', message: result.message }
  return { ok: true }
}

export type PendingSponsorCard = PublicSponsorCard & {
  id: number
  company: string | null
  taskSlug: string | null
  offering: string
  version: number
  updatedAt: number
  contentHash: string
  hadInvisible: boolean
}

export async function listPendingSponsorCards(db: Database): Promise<PendingSponsorCard[]> {
  await expireSponsorResubmissions(db, Date.now())
  const rows = await db
    .select({
      id: sponsorshipCreatives.id,
      status: sponsorshipCreatives.status,
      toolName: sponsorshipCreatives.toolName,
      description: sponsorshipCreatives.description,
      url: sponsorshipCreatives.url,
      logoMime: sponsorshipCreatives.logoMime,
      logoBytes: sponsorshipCreatives.logoBytes,
      version: sponsorshipCreatives.version,
      updatedAt: sponsorshipCreatives.updatedAt,
      contentHash: sponsorshipCreatives.contentHash,
      hadInvisible: sponsorshipCreatives.hadInvisible,
      company: sponsorships.company,
      taskSlug: sponsorships.taskSlug,
      offering: sponsorships.offering,
    })
    .from(sponsorshipCreatives)
    .innerJoin(sponsorships, eq(sponsorshipCreatives.sponsorshipId, sponsorships.id))
    .where(and(eq(sponsorshipCreatives.status, 'pending'), eq(sponsorships.status, 'paid'), isNull(sponsorships.refundedAt)))
  const cards: PendingSponsorCard[] = []
  for (const row of rows) {
    const card = toPublicSponsorCard({ ...row, status: 'approved' })
    if (!card || !row.contentHash) continue
    cards.push({
      ...card,
      id: row.id,
      company: sanitizeSponsorCompany(row.company ?? '') || null,
      taskSlug: row.taskSlug,
      offering: row.offering,
      version: row.version,
      updatedAt: row.updatedAt,
      contentHash: row.contentHash,
      hadInvisible: row.hadInvisible === 1,
    })
  }
  return cards
}

export type RefundPendingSponsorCard = {
  id: number
  name: string
  company: string | null
  taskSlug: string | null
  offering: string
}

export async function listRefundPendingSponsorCards(db: Database): Promise<RefundPendingSponsorCard[]> {
  await expireSponsorResubmissions(db, Date.now())
  const rows = await db
    .select({
      id: sponsorshipCreatives.id,
      toolName: sponsorshipCreatives.toolName,
      company: sponsorships.company,
      taskSlug: sponsorships.taskSlug,
      offering: sponsorships.offering,
    })
    .from(sponsorshipCreatives)
    .innerJoin(sponsorships, eq(sponsorshipCreatives.sponsorshipId, sponsorships.id))
    .where(eq(sponsorshipCreatives.refundStatus, 'refund_pending'))
  return rows.map((row) => ({
    id: row.id,
    name: sanitizeSponsorCompany(row.toolName) || 'Tool card',
    company: sanitizeSponsorCompany(row.company ?? '') || null,
    taskSlug: row.taskSlug,
    offering: row.offering,
  }))
}

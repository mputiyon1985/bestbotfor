import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import type { StepUpDecision } from './admin'
import type { Database } from './db/client'
import { sponsorshipCreatives, sponsorshipReviewEvents, sponsorships } from './db/schema'
import { sanitizeSponsorCompany } from './sponsor-company'

export { SPONSOR_REFUND_NOTE, SPONSOR_REVIEW_NOTICE } from './sponsor-offerings'

export const SPONSOR_CARD_NAME_MIN = 2
export const SPONSOR_CARD_NAME_MAX = 60
export const SPONSOR_CARD_DESCRIPTION_MIN = 12
export const SPONSOR_CARD_DESCRIPTION_MAX = 140
export const SPONSOR_CARD_URL_MAX = 300
export const SPONSOR_LOGO_MAX_BYTES = 200 * 1024
export const SPONSOR_REVIEW_REASON_MAX = 500

const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export type SponsorLogo = {
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
  bytes: Buffer
}

export type ValidSponsorCard = {
  toolName: string
  description: string
  url: string
  logo: SponsorLogo
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
  if (!url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) return null
  return url.href
}

export function parseSponsorLogo(mime: string, bytes: Buffer): SponsorLogo | null {
  if (!LOGO_TYPES.has(mime)) return null
  if (bytes.length < 8 || bytes.length > SPONSOR_LOGO_MAX_BYTES) return null
  if (!logoMagic(mime, bytes)) return null
  return { mime: mime as SponsorLogo['mime'], bytes }
}

export function parseSponsorCardFields(input: {
  toolName: string
  description: string
  url: string
  logoMime: string
  logoBytes: Buffer
}): CardResult {
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
  if (!logo) return { ok: false, message: 'Upload a PNG, JPEG, or WebP logo under 200 KB.' }
  return { ok: true, card: { toolName, description, url, logo } }
}

function asBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  return null
}

export async function readSponsorCardForm(formData: FormData): Promise<CardResult> {
  const logo = formData.get('logo')
  if (!logo || typeof logo !== 'object' || !('arrayBuffer' in logo) || !('type' in logo) || !('size' in logo)) {
    return { ok: false, message: 'Upload a PNG, JPEG, or WebP logo under 200 KB.' }
  }
  const file = logo as { type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }
  if (file.size > SPONSOR_LOGO_MAX_BYTES) {
    return { ok: false, message: 'Upload a PNG, JPEG, or WebP logo under 200 KB.' }
  }
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

async function writeCard(
  db: Database,
  card: ValidSponsorCard,
  now: number,
  where: { id: number } | { requestKey: string; sessionId?: string; sponsorshipId?: number | null },
): Promise<number> {
  const values = {
    toolName: card.toolName,
    description: card.description,
    url: card.url,
    logoMime: card.logo.mime,
    logoBytes: card.logo.bytes,
    updatedAt: now,
  }
  if ('id' in where) {
    await db.update(sponsorshipCreatives).set(values).where(eq(sponsorshipCreatives.id, where.id))
    return where.id
  }
  const inserted = await db
    .insert(sponsorshipCreatives)
    .values({
      ...values,
      requestKey: where.requestKey,
      stripeCheckoutSessionId: where.sessionId ?? null,
      sponsorshipId: where.sponsorshipId ?? null,
      status: 'pending',
      createdAt: now,
    })
    .returning({ id: sponsorshipCreatives.id })
  const id = inserted[0]?.id
  if (!id) throw new Error('sponsor card was not stored')
  return id
}

/** Checkout stores one pending card per form request. A retry updates that row. */
export async function savePendingSponsorCard(
  db: Database,
  input: { requestKey: string; card: ValidSponsorCard; now: number },
): Promise<{ ok: true; id: number } | { ok: false; message: string }> {
  const existing = await db
    .select({ id: sponsorshipCreatives.id, status: sponsorshipCreatives.status })
    .from(sponsorshipCreatives)
    .where(eq(sponsorshipCreatives.requestKey, input.requestKey))
  const row = existing[0]
  if (row && row.status !== 'pending') return { ok: false, message: 'This tool card was already reviewed.' }
  const id = row
    ? await writeCard(db, input.card, input.now, { id: row.id })
    : await writeCard(db, input.card, input.now, { requestKey: input.requestKey })
  return { ok: true, id }
}

const SESSION_ID = /^cs_[A-Za-z0-9_]{8,200}$/

/** After payment, the buyer can submit or replace a card that is still pending. */
export async function saveSponsorCardForSession(
  db: Database,
  input: { sessionId: string; card: ValidSponsorCard; now: number },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!SESSION_ID.test(input.sessionId)) return { ok: false, message: 'That checkout session is not a paid placement.' }
  const sponsorship = await db
    .select({
      id: sponsorships.id,
      status: sponsorships.status,
      offering: sponsorships.offering,
      refundedAt: sponsorships.refundedAt,
    })
    .from(sponsorships)
    .where(eq(sponsorships.stripeCheckoutSessionId, input.sessionId))
  const paid = sponsorship[0]
  if (paid && (paid.status !== 'paid' || paid.refundedAt != null || !paid.offering.startsWith('placement_'))) {
    return { ok: false, message: 'That checkout session is not a paid placement.' }
  }
  const existing = await db
    .select({ id: sponsorshipCreatives.id, status: sponsorshipCreatives.status })
    .from(sponsorshipCreatives)
    .where(
      paid
        ? or(eq(sponsorshipCreatives.stripeCheckoutSessionId, input.sessionId), eq(sponsorshipCreatives.sponsorshipId, paid.id))
        : eq(sponsorshipCreatives.stripeCheckoutSessionId, input.sessionId),
    )
  const row = existing[0]
  if (row && row.status !== 'pending') return { ok: false, message: 'This tool card was already reviewed.' }
  if (row) {
    await db
      .update(sponsorshipCreatives)
      .set({
        toolName: input.card.toolName,
        description: input.card.description,
        url: input.card.url,
        logoMime: input.card.logo.mime,
        logoBytes: input.card.logo.bytes,
        stripeCheckoutSessionId: input.sessionId,
        sponsorshipId: paid?.id ?? null,
        updatedAt: input.now,
      })
      .where(and(eq(sponsorshipCreatives.id, row.id), eq(sponsorshipCreatives.status, 'pending')))
    return { ok: true }
  }
  await writeCard(db, input.card, input.now, {
    requestKey: `session:${input.sessionId}`,
    sessionId: input.sessionId,
    sponsorshipId: paid?.id ?? null,
  })
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
      status: sponsorshipCreatives.status,
      toolName: sponsorshipCreatives.toolName,
      description: sponsorshipCreatives.description,
      url: sponsorshipCreatives.url,
      logoMime: sponsorshipCreatives.logoMime,
      logoBytes: sponsorshipCreatives.logoBytes,
      updatedAt: sponsorshipCreatives.updatedAt,
    })
    .from(sponsorshipCreatives)
    .where(and(inArray(sponsorshipCreatives.sponsorshipId, sponsorshipIds), eq(sponsorshipCreatives.status, 'approved')))
    .orderBy(desc(sponsorshipCreatives.updatedAt))
  for (const row of rows) {
    if (row.sponsorshipId == null || found.has(row.sponsorshipId)) continue
    const card = toPublicSponsorCard(row)
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
  input: { actorId: string; creativeId: number; decision: 'approved' | 'rejected'; reason: string; now: number },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const actorId = sanitizeSponsorCompany(input.actorId)
  if (actorId.length < 1 || actorId.length > 200) return { ok: false, message: 'That tool card is not waiting for review.' }
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
    })
    .from(sponsorshipCreatives)
    .where(eq(sponsorshipCreatives.id, input.creativeId))
  const row = existing[0]
  if (!row || row.status !== 'pending') return { ok: false, message: 'That tool card is not waiting for review.' }
  await db.insert(sponsorshipReviewEvents).values({
    creativeId: row.id,
    sponsorshipId: row.sponsorshipId,
    actor: actorId,
    decision: input.decision,
    reason,
    createdAt: input.now,
  })
  await db
    .update(sponsorshipCreatives)
    .set({ status: input.decision, updatedAt: input.now })
    .where(and(eq(sponsorshipCreatives.id, row.id), eq(sponsorshipCreatives.status, 'pending')))
  return { ok: true }
}

/** Step-up failures write nothing. The caller still has to use requireAdminStepUp(). */
export async function reviewSponsorCardIfAllowed(
  db: Database,
  access: StepUpDecision,
  review: { creativeId: number; decision: 'approved' | 'rejected'; reason: string; now: number },
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
}

export async function listPendingSponsorCards(db: Database): Promise<PendingSponsorCard[]> {
  const rows = await db
    .select({
      id: sponsorshipCreatives.id,
      status: sponsorshipCreatives.status,
      toolName: sponsorshipCreatives.toolName,
      description: sponsorshipCreatives.description,
      url: sponsorshipCreatives.url,
      logoMime: sponsorshipCreatives.logoMime,
      logoBytes: sponsorshipCreatives.logoBytes,
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
    if (!card) continue
    cards.push({
      ...card,
      id: row.id,
      company: sanitizeSponsorCompany(row.company ?? '') || null,
      taskSlug: row.taskSlug,
      offering: row.offering,
    })
  }
  return cards
}

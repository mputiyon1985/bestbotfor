/**
 * Pure deal logic, safe to unit test. The server decides membership and builds
 * the view; non-member views never contain `code` or `dealUrl`.
 */
export type DealRow = {
  id: number
  toolSlug: string
  vendor: string
  title: string
  discountText: string
  code: string | null
  dealUrl: string | null
  terms: string | null
  startsAt: number | null
  expiresAt: number | null
  active: boolean
  createdAt: number
}

export type DealTeaser = {
  locked: true
  id: number
  toolSlug: string
  vendor: string
  title: string
  discountText: string
  expiresAt: number | null
}

export type DealUnlocked = Omit<DealTeaser, 'locked'> & {
  locked: false
  code: string | null
  dealUrl: string | null
  terms: string | null
}

export type DealView = DealTeaser | DealUnlocked

/** Env var: comma-separated Stripe price IDs that count as an active membership for deals. */
export const DEALS_MEMBER_PRICE_IDS_ENV = 'DEALS_MEMBER_PRICE_IDS'

const PRICE_ID = /^price_[A-Za-z0-9]{1,64}$/

/** Unset, empty or malformed values give an empty list: nobody is a member. */
export function parseMemberPriceIds(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => PRICE_ID.test(value))
}

const ACTIVE_STATUSES = new Set(['active', 'trialing'])

/** Signed in, Stripe configured, and an active/trialing subscription on a listed membership price. */
export function isDealMember(input: {
  userId: string | null
  stripeConfigured: boolean
  memberPriceIds: readonly string[]
  subscriptions: readonly { status: string; stripePriceId: string | null }[]
}): boolean {
  if (!input.userId || !input.stripeConfigured || input.memberPriceIds.length === 0) return false
  return input.subscriptions.some(
    (row) => ACTIVE_STATUSES.has(row.status) && row.stripePriceId !== null && input.memberPriceIds.includes(row.stripePriceId),
  )
}

/** Active, started, and not expired at `now` (ms). */
export function isLiveDeal(deal: Pick<DealRow, 'active' | 'startsAt' | 'expiresAt'>, now: number): boolean {
  if (!deal.active) return false
  if (deal.startsAt !== null && deal.startsAt > now) return false
  if (deal.expiresAt !== null && deal.expiresAt <= now) return false
  return true
}

/** A same-site /go path. The slug rules match slugSchema, and nothing else is allowed. */
const GO_DEAL_PATH = /^\/go\/[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * A link the deal card may render. An absolute URL must be https with no
 * credentials. A same-site /go path is the other allowed form, so a member
 * deal can open the catalog redirect without a stored host.
 */
export function safeDealUrl(value: string | null): string | null {
  if (!value) return null
  if (GO_DEAL_PATH.test(value) && value.length <= '/go/'.length + 80) return value
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

export function toDealView(deal: DealRow, member: boolean): DealView {
  const base = {
    id: deal.id,
    toolSlug: deal.toolSlug,
    vendor: deal.vendor,
    title: deal.title,
    discountText: deal.discountText,
    expiresAt: deal.expiresAt,
  }
  if (!member) return { locked: true, ...base }
  return { locked: false, ...base, code: deal.code, dealUrl: safeDealUrl(deal.dealUrl), terms: deal.terms }
}

export function liveDealViews(rows: readonly DealRow[], member: boolean, now: number, toolSlug?: string): DealView[] {
  return rows
    .filter((deal) => isLiveDeal(deal, now) && (toolSlug === undefined || deal.toolSlug === toolSlug))
    .map((deal) => toDealView(deal, member))
}

/** Membership price env vars shared with /pricing (membership pricing PR). */
export const MEMBERSHIP_PRICE_ENVS = ['STRIPE_PRICE_MEMBER_ANNUAL', 'STRIPE_PRICE_MEMBER_MONTHLY'] as const

/** Price IDs that unlock deals: the /pricing membership prices plus any extra IDs in DEALS_MEMBER_PRICE_IDS. All unset = nobody. */
export function dealMemberPriceIds(env: Record<string, string | undefined> = process.env): string[] {
  const ids = [...MEMBERSHIP_PRICE_ENVS, DEALS_MEMBER_PRICE_IDS_ENV].flatMap((name) => parseMemberPriceIds(env[name]))
  return [...new Set(ids)]
}

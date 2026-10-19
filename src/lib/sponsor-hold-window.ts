/**
 * How long a placement checkout hold (sponsorship_slot_claims) counts, from
 * its claimed_at. Placement sessions use Stripe's default 24-hour expiry, so a
 * placement claim older than this can be taken by another buyer.
 */
export const SPONSOR_CHECKOUT_EXPIRY_MS = 24 * 60 * 60 * 1000

/**
 * A founding Checkout session expires this long after its hold's claimed_at
 * (Checkout `expires_at` = claimed_at + 60 minutes). Stripe accepts 30 minutes
 * to 24 hours.
 */
export const FOUNDING_CHECKOUT_SESSION_MS = 60 * 60 * 1000

/**
 * A founding hold counts toward the cap of 5 for this long from claimed_at:
 * 65 minutes, 5 minutes past its session's expires_at, so the session can
 * never complete after its hold stopped counting. Short on purpose: an
 * abandoned or abusive hold frees its spot within about an hour, not a day
 * (Sentinel's lock-all-5 repro on #98, live since #81).
 */
export const FOUNDING_HOLD_MS = 65 * 60 * 1000

/** Stripe refuses a Checkout `expires_at` less than 30 minutes after the session is created. */
export const STRIPE_CHECKOUT_MIN_EXPIRY_MS = 30 * 60 * 1000

/** How long a hold on this offering counts from its claimed_at. */
export function sponsorHoldMs(offering: string): number {
  return offering === 'founding_sponsor' ? FOUNDING_HOLD_MS : SPONSOR_CHECKOUT_EXPIRY_MS
}

/** Checkout `expires_at` (Unix seconds) for a founding session whose hold was claimed at `claimedAt` (ms). */
export function foundingCheckoutExpiresAt(claimedAt: number): number {
  if (!Number.isFinite(claimedAt) || claimedAt <= 0) throw new Error('founding checkout needs its hold time')
  return Math.floor((claimedAt + FOUNDING_CHECKOUT_SESSION_MS) / 1000)
}

/**
 * True when a new Stripe create for this founding hold would be refused,
 * because its fixed expires_at is less than Stripe's 30 minutes away. An
 * identical replay of a session Stripe already made can still succeed.
 */
export function foundingHoldTooOldForNewSession(claimedAt: number, now: number): boolean {
  return foundingCheckoutExpiresAt(claimedAt) * 1000 < now + STRIPE_CHECKOUT_MIN_EXPIRY_MS
}

/** Whole minutes (at least 1) until a founding hold stops counting. */
export function foundingHoldMinutesLeft(claimedAt: number, now: number): number {
  return Math.max(1, Math.ceil((claimedAt + FOUNDING_HOLD_MS - now) / 60_000))
}

/**
 * Shown when the same form (request_id) comes back with other details (email,
 * company, page, offering, or anything else sent to Stripe) while its
 * founding hold is live. One hold has one Checkout session, so the edit is
 * refused instead of opening a second payable session.
 */
export function foundingFormChangedMessage(minutesLeft: number): string {
  const minutes = minutesLeft === 1 ? '1 minute' : `${minutesLeft} minutes`
  return `This form already started a founding checkout with different details, and each founding spot can have only one open checkout. Finish the checkout you opened, or reload the page in ${minutes} to start again with the new details.`
}

/**
 * Legacy founding holds: written by main before the short hold shipped (#103).
 * Their request_key is the bare request_id, and their Checkout session has no
 * expires_at, so Stripe's default 24-hour expiry applies, and their idempotency
 * key is `sponsor-<fingerprint>-<request_id>` with no `-h<claimed_at>`.
 *
 * Every founding hold written by this code stores a marked request_key,
 * `<request_id>|<form key>` (or `<request_id>|s` without a form key,
 * FOUNDING_HOLD_KEY_SUFFIX), so a founding row whose request_key has no `|`
 * was created before this deploy.
 *
 * A legacy hold keeps counting toward the cap for 24 hours plus 5 minutes from
 * claimed_at: its session was created at or after claimed_at and lives 24 hours
 * from creation, so the 5 minutes cover the gap the way FOUNDING_HOLD_MS does
 * for a new hold.
 */
export const LEGACY_FOUNDING_HOLD_MS = SPONSOR_CHECKOUT_EXPIRY_MS + 5 * 60 * 1000

/** Marks a founding hold written by the short-hold code. */
export const FOUNDING_HOLD_KEY_SEPARATOR = '|'
export const FOUNDING_HOLD_KEY_SUFFIX = `${FOUNDING_HOLD_KEY_SEPARATOR}s`

/** True for a founding hold's request_key written before the short hold (a bare request_id). */
export function isLegacyFoundingHoldKey(requestKey: string): boolean {
  return !requestKey.includes(FOUNDING_HOLD_KEY_SEPARATOR)
}

/** SQL: true when the founding row aliased `alias` is a legacy hold. */
export function legacyFoundingHoldSql(alias: string): string {
  return `instr(${alias}.request_key, '${FOUNDING_HOLD_KEY_SEPARATOR}') = 0`
}

/** Whole minutes (at least 1) until a legacy founding hold stops counting. */
export function legacyFoundingHoldMinutesLeft(claimedAt: number, now: number): number {
  return Math.max(1, Math.ceil((claimedAt + LEGACY_FOUNDING_HOLD_MS - now) / 60_000))
}

/**
 * Shown when a request_id with a live legacy founding hold (from before #103)
 * comes back. Its session (Stripe's 24-hour default) may still be paid, and a
 * bare hold stores no form key, so an identical form cannot be told apart
 * from an edited one. It is refused until the legacy hold lapses instead of
 * risking a second payable session.
 */
export function foundingLegacyHoldOpenMessage(minutesLeft: number): string {
  const minutes = minutesLeft === 1 ? '1 minute' : `${minutesLeft} minutes`
  return `This form already has an open founding checkout, and each founding spot can have only one. Finish the checkout you opened, or reload the page in ${minutes} to start again.`
}

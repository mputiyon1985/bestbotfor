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

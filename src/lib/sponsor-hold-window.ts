/**
 * How long a sponsor checkout hold (sponsorship_slot_claims) counts, from its
 * claimed_at. A claim older than this can be taken by another buyer, and a
 * founding hold older than this no longer counts toward the cap of 5.
 */
export const SPONSOR_CHECKOUT_EXPIRY_MS = 24 * 60 * 60 * 1000

/**
 * The founding Checkout session expires this long after its hold's claimed_at
 * (Checkout `expires_at`), 5 minutes before the hold stops counting. Stripe's
 * default 24 hours would run from session creation, which is after the claim,
 * so a session could still complete a few seconds after its hold expired and
 * let a sixth founder in.
 */
export const FOUNDING_CHECKOUT_SESSION_MS = 23 * 60 * 60 * 1000 + 55 * 60 * 1000

/** Stripe accepts a Checkout `expires_at` from 30 minutes to 24 hours after the session is created. */
export const STRIPE_CHECKOUT_MIN_EXPIRY_MS = 30 * 60 * 1000
export const STRIPE_CHECKOUT_MAX_EXPIRY_MS = 24 * 60 * 60 * 1000

/** Room for the time between building the params and Stripe creating the session. */
export const CHECKOUT_EXPIRY_SLACK_MS = 60 * 1000

/**
 * A repeat of the same founding request reuses its hold's claimed_at (so the
 * retry sends Stripe the same expires_at and idempotency key) only while the
 * hold is younger than this: 23h20m, which leaves a session built from it at
 * least 35 minutes (Stripe's 30 plus 5 of slack). Past that, the same request
 * renews its hold at the current time and gets a new idempotency key. The
 * renewed hold still covers any earlier session from the old one, which ends
 * at the old claimed_at + 23h55m.
 */
export const FOUNDING_HOLD_REUSE_MS = FOUNDING_CHECKOUT_SESSION_MS - STRIPE_CHECKOUT_MIN_EXPIRY_MS - 5 * 60 * 1000

export const FOUNDING_HOLD_TOO_OLD = 'founding hold is too old for a new checkout session'

/**
 * Checkout `expires_at` (Unix seconds) for a founding session whose hold was
 * claimed at `claimedAt` (ms), built at `now` (ms): claimedAt + 23h55m, kept
 * inside Stripe's window. The top is clamped to 24 hours from now (less
 * slack), which only matters if claimedAt is ahead of this server's clock.
 * The bottom is never raised past claimedAt + 23h55m, because the session
 * would then outlive its hold: when less than 30 minutes (plus slack) would be
 * left, this throws instead, and the hold is renewed on the next attempt
 * (FOUNDING_HOLD_REUSE_MS).
 */
export function foundingCheckoutExpiresAt(claimedAt: number, now: number = claimedAt): number {
  const target = claimedAt + FOUNDING_CHECKOUT_SESSION_MS
  const earliest = now + STRIPE_CHECKOUT_MIN_EXPIRY_MS + CHECKOUT_EXPIRY_SLACK_MS
  const latest = now + STRIPE_CHECKOUT_MAX_EXPIRY_MS - CHECKOUT_EXPIRY_SLACK_MS
  const expiresAt = Math.min(target, latest)
  if (expiresAt < earliest) throw new Error(FOUNDING_HOLD_TOO_OLD)
  return Math.floor(expiresAt / 1000)
}

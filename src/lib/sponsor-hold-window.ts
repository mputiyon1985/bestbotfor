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
 * let a sixth founder in. Stripe accepts 30 minutes to 24 hours from creation;
 * the session is created seconds after the claim, so this stays in range.
 */
export const FOUNDING_CHECKOUT_SESSION_MS = 23 * 60 * 60 * 1000 + 55 * 60 * 1000

/** Checkout `expires_at` (Unix seconds) for a founding session whose hold was claimed at `claimedAt` (ms). */
export function foundingCheckoutExpiresAt(claimedAt: number): number {
  return Math.floor((claimedAt + FOUNDING_CHECKOUT_SESSION_MS) / 1000)
}

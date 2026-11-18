import { and, eq, gte, isNull, lt, or, sql } from 'drizzle-orm'
import type { Database } from './db'
import { checkoutRecoveryAddressClaims, paymentLinkRecoveryEmails, sponsorAbandonedCheckouts } from './db/schema'

/** One recovery email to an address inside this window, across both senders. */
export const RECOVERY_ADDRESS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

/** Same lease as the in-app session claim. A crashed claim can be taken again after this. */
const ADDRESS_CLAIM_LEASE_MS = 60_000

export type AddressClaim = 'claimed' | 'cooldown'

function normalized(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * One in-flight or sent recovery email per address.
 * The primary key is the address. A second transaction cannot insert another
 * live claim: the conflict update runs only for a failed send, a sent row
 * older than 7 days, or a claim whose lease has expired.
 * A Resend 4xx is stored as `failed` and is not inside the 7-day window.
 * Successful rows in either sender's table also count, so the two senders
 * see each other's sends.
 */
export async function claimRecoveryAddress(
  db: Database,
  email: string,
  sessionId: string,
  now: number,
): Promise<AddressClaim> {
  const address = normalized(email)
  const cutoff = now - RECOVERY_ADDRESS_COOLDOWN_MS
  return db.transaction(async (tx) => {
    const sponsorRecent = await tx
      .select({ id: sponsorAbandonedCheckouts.stripeCheckoutSessionId })
      .from(sponsorAbandonedCheckouts)
      .where(
        and(
          sql`lower(${sponsorAbandonedCheckouts.email}) = ${address}`,
          gte(sponsorAbandonedCheckouts.recoveryEmailSentAt, cutoff),
        ),
      )
      .limit(1)
    if (sponsorRecent.length > 0) return 'cooldown'
    const linkRecent = await tx
      .select({ id: paymentLinkRecoveryEmails.stripeCheckoutSessionId })
      .from(paymentLinkRecoveryEmails)
      .where(
        and(
          sql`lower(${paymentLinkRecoveryEmails.email}) = ${address}`,
          gte(paymentLinkRecoveryEmails.sentAt, cutoff),
          or(isNull(paymentLinkRecoveryEmails.sendStatus), eq(paymentLinkRecoveryEmails.sendStatus, 'sent')),
        ),
      )
      .limit(1)
    if (linkRecent.length > 0) return 'cooldown'
    const claimed = await tx
      .insert(checkoutRecoveryAddressClaims)
      .values({
        email: address,
        stripeCheckoutSessionId: sessionId,
        status: 'claimed',
        claimedAt: now,
        sentAt: null,
      })
      .onConflictDoUpdate({
        target: checkoutRecoveryAddressClaims.email,
        set: {
          stripeCheckoutSessionId: sessionId,
          status: 'claimed',
          claimedAt: now,
          sentAt: null,
        },
        setWhere: or(
          eq(checkoutRecoveryAddressClaims.status, 'failed'),
          and(eq(checkoutRecoveryAddressClaims.status, 'sent'), lt(checkoutRecoveryAddressClaims.sentAt, cutoff)),
          and(
            eq(checkoutRecoveryAddressClaims.status, 'claimed'),
            lt(checkoutRecoveryAddressClaims.claimedAt, now - ADDRESS_CLAIM_LEASE_MS),
          ),
        ),
      })
      .returning({ email: checkoutRecoveryAddressClaims.email })
    return claimed.length > 0 ? 'claimed' : 'cooldown'
  })
}

export async function markRecoveryAddressSent(db: Database, email: string, sessionId: string, now: number): Promise<void> {
  const address = normalized(email)
  await db
    .update(checkoutRecoveryAddressClaims)
    .set({ status: 'sent', sentAt: now })
    .where(
      and(
        eq(checkoutRecoveryAddressClaims.email, address),
        eq(checkoutRecoveryAddressClaims.stripeCheckoutSessionId, sessionId),
        eq(checkoutRecoveryAddressClaims.status, 'claimed'),
      ),
    )
}

/** A 4xx is not a delivery. The address can be claimed again, including inside 7 days. */
export async function markRecoveryAddressFailed(db: Database, email: string, sessionId: string): Promise<void> {
  const address = normalized(email)
  await db
    .update(checkoutRecoveryAddressClaims)
    .set({ status: 'failed', sentAt: null })
    .where(
      and(
        eq(checkoutRecoveryAddressClaims.email, address),
        eq(checkoutRecoveryAddressClaims.stripeCheckoutSessionId, sessionId),
        eq(checkoutRecoveryAddressClaims.status, 'claimed'),
      ),
    )
}

/** Drop an in-flight claim so a retryable failure can try this address again. */
export async function releaseRecoveryAddressClaim(db: Database, email: string, sessionId: string): Promise<void> {
  const address = normalized(email)
  await db
    .delete(checkoutRecoveryAddressClaims)
    .where(
      and(
        eq(checkoutRecoveryAddressClaims.email, address),
        eq(checkoutRecoveryAddressClaims.stripeCheckoutSessionId, sessionId),
        eq(checkoutRecoveryAddressClaims.status, 'claimed'),
      ),
    )
}

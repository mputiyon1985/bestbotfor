/** Saved locally. Not sent to Beehiiv, so it is not synced and not subscribed. */
export const PENDING_SUBSCRIBER_STATUS = 'pending'

/** Claimed for a Beehiiv call. Not counted, and a second sender skips it until it is stale. */
export const SYNCING_SUBSCRIBER_STATUS = 'syncing'

/** A claim older than this is no longer an in-flight call. Fifteen minutes. */
export const SYNCING_STALE_AFTER_MS = 15 * 60 * 1000

/** Beehiiv accepted the address with double opt-in. This is the only counted status. */
export const SYNCED_SUBSCRIBER_STATUS = 'synced'

/**
 * Beehiiv reports this address inactive or unsubscribed.
 * A later form submit leaves the row here. It is not claimed, posted, or counted.
 */
export const UNSUBSCRIBED_SUBSCRIBER_STATUS = 'unsubscribed'

/**
 * Beehiiv reported invalid, paused, or needs_attention.
 * Not counted, and nothing posts it.
 */
export const FAILED_SUBSCRIBER_STATUS = 'failed'

export const PENDING_SUCCESS = "You'll get a confirmation email when The Daily Bot launches."

/** Beehiiv accepted the address. The confirmation email still has to be opened. */
export const SYNCED_SUCCESS = 'Check your email to confirm.'

/** Another request already holds this address. This is not a failure. */
export const RACE_SUCCESS = "You're being added. Check your email to confirm."

/** Beehiiv cannot accept this address. A later signup does not post it. */
export const FAILED_NOTICE = "This address can't be added."

/** A signup that did not add the address. It does not name a Beehiiv status. */
export const ADD_FAILED = "We couldn't add you just now. Try again in a few minutes."

/** Paused and needs_attention use the same line as any other signup that was not added. */
export function nonAddMessage(beehiivStatus: string | null | undefined): string {
  const value = (beehiivStatus ?? '').trim().toLowerCase()
  if (value === 'paused' || value === 'needs_attention') return ADD_FAILED
  return FAILED_NOTICE
}

/** Saved locally. Not sent to Beehiiv, so it is not synced and not subscribed. */
export const PENDING_SUBSCRIBER_STATUS = 'pending'

/** Claimed for a Beehiiv call. Not counted, and a second sender skips it until it is stale. */
export const SYNCING_SUBSCRIBER_STATUS = 'syncing'

/** A claim older than this is no longer an in-flight call. Fifteen minutes. */
export const SYNCING_STALE_AFTER_MS = 15 * 60 * 1000

/** Beehiiv accepted the address with double opt-in. This is the only counted status. */
export const SYNCED_SUBSCRIBER_STATUS = 'synced'

export const PENDING_SUCCESS = "You'll get a confirmation email when The Daily Bot launches."

/** Beehiiv accepted the address. The confirmation email still has to be opened. */
export const SYNCED_SUCCESS = 'Check your email to confirm.'

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
 * It is not counted, and nothing sends it again.
 */
export const UNSUBSCRIBED_SUBSCRIBER_STATUS = 'unsubscribed'

export const PENDING_SUCCESS = "You'll get a confirmation email when The Daily Bot launches."

/** Beehiiv accepted the address. The confirmation email still has to be opened. */
export const SYNCED_SUCCESS = 'Check your email to confirm.'

/** Another request already holds this address. This is not a failure. */
export const RACE_SUCCESS = "You're being added. Check your email to confirm."

/** Beehiiv says this address opted out. A later signup does not subscribe it again. */
export const UNSUBSCRIBED_NOTICE = 'This address is unsubscribed. We will not add it again.'

/** Shared windows. The privacy policy names these values and must stay in step with them. */

export const RESULT_RATE_LIMIT = 30
export const RESULT_RATE_WINDOW_MS = 60_000

export const CHECKOUT_RATE_LIMIT = 8
export const CHECKOUT_RATE_WINDOW_MS = 60 * 60_000

export const PORTAL_RATE_LIMIT = 12
export const PORTAL_RATE_WINDOW_MS = 60 * 60_000

export const NEWSLETTER_RATE_LIMIT = 5
export const NEWSLETTER_RATE_WINDOW_MS = 60 * 60_000

export const GO_RATE_LIMIT = 60
export const GO_RATE_WINDOW_MS = 60_000

export const SPONSOR_RATE_LIMIT = 8
export const SPONSOR_RATE_WINDOW_MS = 60 * 60_000

/**
 * New founding sponsor holds per network address, on top of the sponsor
 * checkout limit. Without it one address could hold all 5 founding spots for
 * free (Sentinel's lock-all-5 repro on #98). A repeat of a live hold's own
 * request does not count; only a newly created hold does.
 */
export const FOUNDING_HOLD_RATE_LIMIT = 2
export const FOUNDING_HOLD_RATE_WINDOW_MS = 24 * 60 * 60_000

/** Suggestion box. Its own bucket, separate from newsletter signup. */
export const SUGGESTION_RATE_LIMIT = 5
export const SUGGESTION_RATE_WINDOW_MS = 60 * 60_000

/** How often one server process deletes expired quiz-result windows. */
export const RESULT_WINDOW_PURGE_INTERVAL_MS = 60_000

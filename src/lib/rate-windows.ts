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

/** Suggestion box. Its own bucket, separate from newsletter signup. */
export const SUGGESTION_RATE_LIMIT = 5
export const SUGGESTION_RATE_WINDOW_MS = 60 * 60_000

/** How often one server process deletes expired quiz-result windows. */
export const RESULT_WINDOW_PURGE_INTERVAL_MS = 60_000

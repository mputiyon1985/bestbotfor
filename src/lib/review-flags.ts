/**
 * Production launch switch for user ratings.
 * Ships false. Production stays off until a launch PR sets this to true,
 * even when USER_RATINGS is on. A code constant, same as SHOW_SCORES.
 */
export const USER_RATINGS_PRODUCTION_LAUNCH: boolean = false

/**
 * Production launch switch for the sponsor admin queue.
 * Ships false until the A18 real Clerk admin test passes.
 * Production stays off until a launch PR sets this to true,
 * even when ADMIN_SPONSORS is on. A code constant, same as SHOW_SCORES.
 */
export const ADMIN_SPONSORS_PRODUCTION_LAUNCH: boolean = false

/**
 * Affiliate tracking links are not live.
 * The Advertiser label's affiliate clause stays off until this is true.
 * A code constant, same as SHOW_SCORES.
 */
export const AFFILIATE_LINKS_LIVE: boolean = false

/**
 * schema.org AggregateRating built from published user ratings.
 * Ships false for MVP and stays off until hardening validates rich results.
 * A code constant, same as SHOW_SCORES.
 */
export const SHOW_USER_AGGREGATE_JSONLD: boolean = false

/**
 * ratings-not-launched gate for /review-guidelines and /how-user-ratings-work.
 * Lawyer review was recorded on October 17, 2026. This constant is not that
 * switch. It stays false until the ratings launch PR, which keeps those two
 * pages noindex, nofollow. It does not turn ratings on.
 * /privacy, /terms, and /disclosure use ordinary page metadata. They were
 * already indexed on main.
 */
export const POLICY_PAGES_LAWYER_APPROVED: boolean = false

/**
 * Production launch switch for user ratings.
 * Ships false. Production stays off until a launch PR sets this to true,
 * even when USER_RATINGS is on. A code constant, same as SHOW_SCORES.
 */
export const USER_RATINGS_PRODUCTION_LAUNCH: boolean = false

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
 * Lawyer review of /privacy, /terms, and /disclosure was recorded on
 * 2026-10-17 (James, 10:46 AM ET). Those pages use ordinary page metadata,
 * so production indexes them. They stay in the sitemap and robots.txt does
 * not disallow them.
 * /review-guidelines and /how-user-ratings-work stay noindex, nofollow until
 * user ratings launch. This constant stays false until that launch PR, which
 * is also what keeps those two pages out of search. It does not turn ratings on.
 */
export const POLICY_PAGES_LAWYER_APPROVED: boolean = false

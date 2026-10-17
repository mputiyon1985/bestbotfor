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
 * Review guidelines and "How user ratings work" stay out of search until a
 * lawyer signs off on the draft. While this is false, those pages hard-set
 * robots to noindex, nofollow in every environment, including production.
 * A later PR sets this to true after that review is recorded.
 */
export const POLICY_PAGES_LAWYER_APPROVED: boolean = false

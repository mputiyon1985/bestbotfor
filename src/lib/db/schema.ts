import { desc, sql } from 'drizzle-orm'
import { blob, check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const tools = sqliteTable('tools', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  vendor: text('vendor').notNull(),
  url: text('url').notNull(),
  category: text('category').notNull(),
  shortDesc: text('short_desc').notNull(),
  longDesc: text('long_desc').notNull(),
  pricingModel: text('pricing_model').notNull(),
  priceFromUsd: real('price_from_usd'),
  hasFreeTier: integer('has_free_tier', { mode: 'boolean' }).notNull(),
  skillLevel: text('skill_level').notNull(),
  platforms: text('platforms').notNull(),
  lastVerifiedAt: text('last_verified_at').notNull(),
  status: text('status').notNull(),
  /** True when the catalog entry needs a fresh check, such as a reported rename. The score stays hidden. */
  needsVerification: integer('needs_verification', { mode: 'boolean' }).notNull().default(false),
})

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull(),
})

export const toolTasks = sqliteTable(
  'tool_tasks',
  {
    toolId: integer('tool_id').notNull(),
    taskId: integer('task_id').notNull(),
    fitScore: integer('fit_score').notNull(),
    notes: text('notes').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.toolId, table.taskId] }),
    uniqueIndex('tool_tasks_tool_task_unique').on(table.toolId, table.taskId),
  ],
)

/**
 * One editorial rubric per tool. overall is the weighted average documented
 * in src/lib/editorial.ts (quality 40, features 25, value 20, ease 15).
 * sources stays an empty list: evidence_ref, source_urls, and third-party
 * columns are not stored. Per-point source URLs stay on tool_pros_cons and are not rendered.
 * This is not a user review.
 */
export const toolScores = sqliteTable('tool_scores', {
  toolId: integer('tool_id').primaryKey(),
  features: real('features').notNull(),
  value: real('value').notNull(),
  ease: real('ease').notNull(),
  quality: real('quality').notNull(),
  overall: real('overall').notNull(),
  rationale: text('rationale').notNull(),
  sources: text('sources').notNull(),
  reviewedAt: text('reviewed_at').notNull(),
  primaryCategory: text('primary_category').notNull().default(''),
  categoryRankDisplay: text('category_rank_display').notNull().default(''),
  tieGroup: text('tie_group').notNull().default(''),
  note: text('note').notNull().default(''),
  ratingStatus: text('rating_status').notNull().default(''),
  quizEligible: integer('quiz_eligible', { mode: 'boolean' }).notNull().default(true),
})

/** Three pros and two or three cons. position is 1-based within kind. */
export const toolProsCons = sqliteTable(
  'tool_pros_cons',
  {
    toolId: integer('tool_id').notNull(),
    kind: text('kind').notNull(),
    position: integer('position').notNull(),
    body: text('body').notNull(),
    sourceUrl: text('source_url').notNull(),
  },
  (table) => [primaryKey({ columns: [table.toolId, table.kind, table.position] })],
)

/**
 * Affiliate URL is stored so a future enrollment can be recorded.
 * /go never reads affiliate_url. Redirects use tools.url only.
 */
export const affiliatePrograms = sqliteTable('affiliate_programs', {
  toolId: integer('tool_id').primaryKey(),
  hasProgram: integer('has_program', { mode: 'boolean' }).notNull(),
  network: text('network'),
  sourceUrl: text('source_url'),
  status: text('status').notNull(),
  affiliateUrl: text('affiliate_url'),
  commissionNote: text('commission_note'),
  verifiedAt: text('verified_at'),
})

export const clicks = sqliteTable(
  'clicks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    toolId: integer('tool_id').notNull(),
    page: text('page').notNull(),
    ts: integer('ts').notNull(),
    country: text('country'),
    ipHash: text('ip_hash'),
  },
  (table) => [index('clicks_ts_idx').on(table.ts)],
)

export const subscribers = sqliteTable('subscribers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  createdAt: integer('created_at').notNull(),
  destination: text('destination').notNull(),
  beehiivId: text('beehiiv_id'),
  /** Beehiiv's status when this row is parked as `failed`. Null for every other row. */
  beehiivStatus: text('beehiiv_status'),
  /** `pending` until a sender claims it as `syncing`. `synced` is counted. `unsubscribed` is not sent by backfill. `failed` is terminal. */
  status: text('status').notNull().default('pending'),
  /** Set when the row becomes `syncing`. Null means a crash left no clock, so reconcile treats it as stale. */
  syncingStartedAt: integer('syncing_started_at'),
})

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clerkUserId: text('clerk_user_id'),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    stripePriceId: text('stripe_price_id'),
    status: text('status').notNull(),
    currentPeriodEnd: integer('current_period_end'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('subscriptions_user_idx').on(table.clerkUserId)],
)

export const stripeEvents = sqliteTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  processedAt: integer('processed_at').notNull(),
})

export const sponsorships = sqliteTable(
  'sponsorships',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    stripeCheckoutSessionId: text('stripe_checkout_session_id').notNull().unique(),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    stripeCustomerId: text('stripe_customer_id'),
    stripePriceId: text('stripe_price_id'),
    offering: text('offering').notNull(),
    status: text('status').notNull(),
    email: text('email'),
    company: text('company'),
    taskSlug: text('task_slug'),
    issueDate: text('issue_date'),
    amountTotal: integer('amount_total'),
    currency: text('currency'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    /** First time status became paid. The placement window starts here and is not moved later. */
    paidAt: integer('paid_at'),
    /** Set once when a refund event matches this payment. The placement stops showing. */
    refundedAt: integer('refunded_at'),
  },
  (table) => [index('sponsorships_status_idx').on(table.status)],
)

/** Buyer-submitted tool card. Hidden until status is approved. */
export const sponsorshipCreatives = sqliteTable(
  'sponsorship_creatives',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sponsorshipId: integer('sponsorship_id'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    requestKey: text('request_key').unique(),
    toolName: text('tool_name').notNull(),
    description: text('description').notNull(),
    url: text('url').notNull(),
    logoMime: text('logo_mime').notNull(),
    logoBytes: blob('logo_bytes', { mode: 'buffer' }).notNull(),
    status: text('status').notNull(),
    /** Increments when the buyer replaces the card. Approval is bound to this value. */
    version: integer('version').notNull().default(1),
    contentHash: text('content_hash'),
    rejectedAt: integer('rejected_at'),
    /** How many times the buyer resubmitted after a rejection. One is the maximum. */
    resubmissionCount: integer('resubmission_count').notNull().default(0),
    /** null, refund_pending, or refunded. Set after the resubmission window ends. */
    refundStatus: text('refund_status'),
    hadInvisible: integer('had_invisible').notNull().default(0),
    approvedToolName: text('approved_tool_name'),
    approvedDescription: text('approved_description'),
    approvedUrl: text('approved_url'),
    approvedLogoMime: text('approved_logo_mime'),
    approvedLogoBytes: blob('approved_logo_bytes', { mode: 'buffer' }),
    approvedContentHash: text('approved_content_hash'),
    approvedVersion: integer('approved_version'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('sponsorship_creatives_status_idx').on(table.status),
    index('sponsorship_creatives_sponsorship_idx').on(table.sponsorshipId),
    index('sponsorship_creatives_session_idx').on(table.stripeCheckoutSessionId),
  ],
)

/**
 * Daily totals for one sponsorship. impressions is an approved card render.
 * go_clicks is a /go Visit from that /best page. No visitor identifier.
 */
export const sponsorshipDailyCounts = sqliteTable(
  'sponsorship_daily_counts',
  {
    sponsorshipId: integer('sponsorship_id').notNull(),
    day: text('day').notNull(),
    impressions: integer('impressions').notNull().default(0),
    goClicks: integer('go_clicks').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.sponsorshipId, table.day] }),
    index('sponsorship_daily_counts_day_idx').on(table.day),
  ],
)

/** Append-only admin decisions for a sponsor tool card. */
export const sponsorshipReviewEvents = sqliteTable(
  'sponsorship_review_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    creativeId: integer('creative_id').notNull(),
    sponsorshipId: integer('sponsorship_id'),
    actor: text('actor').notNull(),
    decision: text('decision').notNull(),
    reason: text('reason').notNull(),
    contentHash: text('content_hash'),
    version: integer('version'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('sponsorship_review_events_creative_idx').on(table.creativeId)],
)

/** Append-only refund workflow. Separate from approve/reject so that check stays unchanged. */
export const sponsorshipRefundEvents = sqliteTable(
  'sponsorship_refund_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    creativeId: integer('creative_id').notNull(),
    sponsorshipId: integer('sponsorship_id'),
    actor: text('actor').notNull(),
    decision: text('decision').notNull(),
    reason: text('reason').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('sponsorship_refund_events_creative_idx').on(table.creativeId)],
)

/** One live checkout hold per task page. No buyer identity is stored. */
export const sponsorshipSlotClaims = sqliteTable('sponsorship_slot_claims', {
  taskSlug: text('task_slug').primaryKey(),
  requestKey: text('request_key').notNull(),
  offering: text('offering').notNull(),
  claimedAt: integer('claimed_at').notNull(),
})

export const savedPicks = sqliteTable(
  'saved_picks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clerkUserId: text('clerk_user_id').notNull(),
    taskSlug: text('task_slug').notNull(),
    budget: text('budget').notNull(),
    skill: text('skill').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('saved_picks_user_idx').on(table.clerkUserId)],
)

export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    resetAt: integer('reset_at').notNull(),
  },
  (table) => [index('rate_limits_reset_at_idx').on(table.resetAt)],
)

/** One row per hashed client and fixed window. Expired rows are deleted after the response. */
export const resultRateWindows = sqliteTable(
  'result_rate_windows',
  {
    bucket: text('bucket').primaryKey(),
    count: integer('count').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [index('result_rate_windows_expires_idx').on(table.expiresAt)],
)

/**
 * One rating per user per tool. latest_version_id and published_version_id
 * reference review_versions. That cycle is DEFERRABLE in the SQL migration.
 * Drizzle builds references immediately, so those two columns stay plain
 * integers here. ip_hmac is a keyed HMAC of the full submit IP.
 * net_hmac is a keyed HMAC of the IPv4 /24 or IPv6 /48 bucket.
 * ip_key_id is the key version, such as "k1". Both hashes use
 * REVIEW_IP_HMAC_SECRET, with HKDF labels bestbotfor/review-ip/v1 and
 * bestbotfor/review-net/v1. ip_hmac is HMAC-SHA256 of
 * "bestbotfor-review-ip|v1|" plus the IP, under K_ip. Computing the
 * hashes is A5. A competitor-domain match is a moderator hint only
 * and has no column here, so it cannot block a review.
 * No email is stored.
 */
export const reviews = sqliteTable(
  'reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    toolId: integer('tool_id')
      .notNull()
      .references(() => tools.id),
    clerkUserId: text('clerk_user_id').notNull(),
    status: text('status').notNull(),
    publishedVersionId: integer('published_version_id'),
    latestVersionId: integer('latest_version_id').notNull(),
    weight: real('weight').notNull().default(1),
    countsTowardScore: integer('counts_toward_score').notNull().default(1),
    displayName: text('display_name').notNull(),
    ipHmac: text('ip_hmac'),
    netHmac: text('net_hmac'),
    ipKeyId: text('ip_key_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    publishedAt: integer('published_at'),
  },
  (table) => [
    uniqueIndex('reviews_user_tool_unique').on(table.clerkUserId, table.toolId),
    index('reviews_tool_status_published_idx').on(table.toolId, table.status, desc(table.publishedAt)),
    index('reviews_status_created_idx').on(table.status, table.createdAt),
    index('reviews_ip_created_idx').on(table.ipHmac, table.createdAt),
    index('reviews_tool_net_created_idx').on(table.toolId, table.netHmac, table.createdAt),
    check(
      'reviews_status_check',
      sql`${table.status} in ('pending', 'held', 'published', 'rejected', 'removed', 'withdrawn')`,
    ),
    check('reviews_weight_check', sql`${table.weight} in (1.0, 1.5)`),
    check('reviews_counts_toward_score_check', sql`${table.countsTowardScore} in (0, 1)`),
    check('reviews_display_name_check', sql`length(${table.displayName}) between 1 and 60`),
  ],
)

/** Append-only edit history. Content changes insert a new row. */
export const reviewVersions = sqliteTable(
  'review_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reviewId: integer('review_id')
      .notNull()
      .references(() => reviews.id),
    versionNo: integer('version_no').notNull(),
    stars: integer('stars').notNull(),
    pros: text('pros').notNull().default(''),
    cons: text('cons').notNull().default(''),
    useCaseText: text('use_case_text').notNull().default(''),
    role: text('role'),
    usageDuration: text('usage_duration'),
    planType: text('plan_type'),
    connection: text('connection').notNull(),
    connectionText: text('connection_text').notNull().default(''),
    attestationVersion: text('attestation_version').notNull(),
    vendorDomainCheck: text('vendor_domain_check').notNull(),
    decision: text('decision').notNull().default('pending'),
    reasonCode: text('reason_code'),
    contentHash: text('content_hash').notNull(),
    createdAt: integer('created_at').notNull(),
    decidedAt: integer('decided_at'),
  },
  (table) => [
    uniqueIndex('review_versions_review_no_unique').on(table.reviewId, table.versionNo),
    check('review_versions_stars_check', sql`${table.stars} between 1 and 5`),
    check('review_versions_pros_check', sql`length(${table.pros}) <= 1000`),
    check('review_versions_cons_check', sql`length(${table.cons}) <= 1000`),
    check('review_versions_use_case_check', sql`length(${table.useCaseText}) <= 280`),
    check('review_versions_connection_check', sql`${table.connection} in ('none', 'disclosed')`),
    check(
      'review_versions_connection_text_check',
      sql`(${table.connection} = 'none' and ${table.connectionText} = '') or (${table.connection} = 'disclosed' and length(${table.connectionText}) between 1 and 140)`,
    ),
    check('review_versions_vendor_domain_check', sql`${table.vendorDomainCheck} in ('pass', 'no_corporate_domain')`),
    check('review_versions_decision_check', sql`${table.decision} in ('pending', 'approved', 'rejected', 'superseded')`),
  ],
)

export const reviewReports = sqliteTable(
  'review_reports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reviewId: integer('review_id')
      .notNull()
      .references(() => reviews.id),
    reporterUserId: text('reporter_user_id').notNull(),
    reasonCode: text('reason_code').notNull(),
    note: text('note').notNull().default(''),
    status: text('status').notNull(),
    createdAt: integer('created_at').notNull(),
    resolvedAt: integer('resolved_at'),
    resolvedBy: text('resolved_by'),
  },
  (table) => [
    uniqueIndex('review_reports_review_reporter_unique').on(table.reviewId, table.reporterUserId),
    index('review_reports_status_created_idx').on(table.status, table.createdAt),
    check('review_reports_note_check', sql`length(${table.note}) <= 500`),
    check('review_reports_status_check', sql`${table.status} in ('open', 'upheld', 'dismissed')`),
  ],
)

/** Append-only audit log. Triggers abort any update or delete. */
export const moderationEvents = sqliteTable(
  'moderation_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reviewId: integer('review_id'),
    versionId: integer('version_id'),
    reportId: integer('report_id'),
    actorType: text('actor_type').notNull(),
    actorRef: text('actor_ref').notNull(),
    action: text('action').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    reasonCode: text('reason_code'),
    note: text('note').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    prevHash: text('prev_hash'),
    hash: text('hash'),
  },
  (table) => [
    check('moderation_events_actor_type_check', sql`${table.actorType} in ('system', 'admin', 'user', 'webhook')`),
    check('moderation_events_note_check', sql`length(${table.note}) <= 500`),
  ],
)

/** Cache of published, counting ratings. Recomputed from reviews. */
export const reviewAggregates = sqliteTable('review_aggregates', {
  toolId: integer('tool_id')
    .primaryKey()
    .references(() => tools.id),
  publishedCount: integer('published_count').notNull().default(0),
  weightTotal: real('weight_total').notNull().default(0),
  weightedSum: real('weighted_sum').notNull().default(0),
  star1: integer('star_1').notNull().default(0),
  star2: integer('star_2').notNull().default(0),
  star3: integer('star_3').notNull().default(0),
  star4: integer('star_4').notNull().default(0),
  star5: integer('star_5').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
})

export const toolVendorDomains = sqliteTable(
  'tool_vendor_domains',
  {
    toolId: integer('tool_id')
      .notNull()
      .references(() => tools.id),
    domain: text('domain').notNull(),
    source: text('source').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.toolId, table.domain] }),
    check('tool_vendor_domains_source_check', sql`${table.source} in ('tool_url', 'manual')`),
  ],
)

/**
 * sponsorship_id is an optional id from the sponsorships table in PR #10.
 * This schema does not declare that foreign key: the table is not here yet,
 * and a reference to a missing table rejects every insert.
 */
export const toolSponsorLinks = sqliteTable(
  'tool_sponsor_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    toolId: integer('tool_id')
      .notNull()
      .references(() => tools.id),
    sponsorshipId: integer('sponsorship_id'),
    startsAt: integer('starts_at').notNull(),
    endsAt: integer('ends_at'),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('tool_sponsor_links_tool_ends_idx').on(table.toolId, table.endsAt)],
)

/** Private suggestion box. No address column. Not shown on the site. */
export const suggestions = sqliteTable('suggestions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),
  message: text('message').notNull(),
  email: text('email'),
  createdAt: integer('created_at').notNull(),
})

export const userTombstones = sqliteTable('user_tombstones', {
  userHmac: text('user_hmac').primaryKey(),
  deletedAt: integer('deleted_at').notNull(),
})

/** Idempotency row for a Clerk webhook. id is the svix-id header. */
export const webhookEvents = sqliteTable('webhook_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  processedAt: integer('processed_at').notNull(),
})

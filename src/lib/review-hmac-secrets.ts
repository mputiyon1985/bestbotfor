import { createHash, hkdfSync, timingSafeEqual } from 'node:crypto'

/**
 * Spec v1.2.1 §7.2. One validator for build (`next.config.ts`) and server boot
 * (`src/instrumentation.ts`). Errors name the variable and the rule only.
 * They never include a secret value or a fragment of one.
 */

export const REVIEW_IP_HKDF_LABEL = 'bestbotfor/review-ip/v1'
export const REVIEW_NET_HKDF_LABEL = 'bestbotfor/review-net/v1'
export const REVIEW_HMAC_MIN_BYTES = 32
export const REVIEW_KEY_ID_RULE = '^k[1-9][0-9]{0,3}$'

const KEY_ID_PATTERN = new RegExp(REVIEW_KEY_ID_RULE)

export type ReviewHmacEnv = {
  reviewIpHmacSecret?: string
  reviewIpHmacKeyId?: string
  reviewIpHmacSecretPrevious?: string
  reviewIpHmacKeyIdPrevious?: string
  rateLimitHmacSecret?: string
  userRatings?: string
  vercelEnv?: string
  vercel?: string
  nodeEnv?: string
  bbfE2eHooks?: string
}

function clean(value: string | undefined): string {
  return value?.trim() ?? ''
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

/** SHA-256 both values, then compare the digests. The raw secrets are never compared. */
function sameSecret(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left).digest()
  const rightDigest = createHash('sha256').update(right).digest()
  return timingSafeEqual(leftDigest, rightDigest)
}

function processReviewHmacEnv(env: NodeJS.ProcessEnv = process.env): ReviewHmacEnv {
  return {
    reviewIpHmacSecret: env.REVIEW_IP_HMAC_SECRET,
    reviewIpHmacKeyId: env.REVIEW_IP_HMAC_KEY_ID,
    reviewIpHmacSecretPrevious: env.REVIEW_IP_HMAC_SECRET_PREVIOUS,
    reviewIpHmacKeyIdPrevious: env.REVIEW_IP_HMAC_KEY_ID_PREVIOUS,
    rateLimitHmacSecret: env.RATE_LIMIT_HMAC_SECRET,
    userRatings: env.USER_RATINGS,
    vercelEnv: env.VERCEL_ENV,
    vercel: env.VERCEL,
    nodeEnv: env.NODE_ENV,
    bbfE2eHooks: env.BBF_E2E_HOOKS,
  }
}

/**
 * Rules, in stable order:
 * 1. BBF_E2E_HOOKS=1 with VERCEL=1, VERCEL_ENV=production, or NODE_ENV=production
 * 2. RATE_LIMIT_HMAC_SECRET length in production only (HKDF fallback stays elsewhere)
 * 3. REVIEW_IP_HMAC_SECRET required in production and when USER_RATINGS=on, else when set
 * 4. REVIEW_IP_HMAC_KEY_ID required with that secret
 * 5. Optional previous secret, and a previous id with no previous secret
 * 6. Review secret distinct from the rate-limit secret and the previous review secret
 */
export function reviewHmacSecretErrors(env: ReviewHmacEnv): string[] {
  const errors: string[] = []
  const review = clean(env.reviewIpHmacSecret)
  const keyId = clean(env.reviewIpHmacKeyId)
  const previous = clean(env.reviewIpHmacSecretPrevious)
  const previousId = clean(env.reviewIpHmacKeyIdPrevious)
  const rateLimit = clean(env.rateLimitHmacSecret)
  const production = clean(env.vercelEnv) === 'production'
  const ratingsOn = clean(env.userRatings) === 'on'
  const reviewRequired = production || ratingsOn

  if (clean(env.bbfE2eHooks) === '1') {
    if (clean(env.vercel) === '1') errors.push('BBF_E2E_HOOKS must not be 1 when VERCEL is 1')
    if (production) errors.push('BBF_E2E_HOOKS must not be 1 when VERCEL_ENV is production')
    if (clean(env.nodeEnv) === 'production') errors.push('BBF_E2E_HOOKS must not be 1 when NODE_ENV is production')
  }

  if (production) {
    if (!rateLimit) errors.push('RATE_LIMIT_HMAC_SECRET is required')
    else if (byteLength(rateLimit) < REVIEW_HMAC_MIN_BYTES) {
      errors.push('RATE_LIMIT_HMAC_SECRET must be at least 32 bytes')
    }
  }

  if (reviewRequired && !review) errors.push('REVIEW_IP_HMAC_SECRET is required')
  else if (review && byteLength(review) < REVIEW_HMAC_MIN_BYTES) {
    errors.push('REVIEW_IP_HMAC_SECRET must be at least 32 bytes')
  }

  const keyIdRequired = reviewRequired || review.length > 0
  if (keyIdRequired && !keyId) errors.push('REVIEW_IP_HMAC_KEY_ID is required')
  else if (keyId && !KEY_ID_PATTERN.test(keyId)) {
    errors.push(`REVIEW_IP_HMAC_KEY_ID must match ${REVIEW_KEY_ID_RULE}`)
  }

  if (previous && byteLength(previous) < REVIEW_HMAC_MIN_BYTES) {
    errors.push('REVIEW_IP_HMAC_SECRET_PREVIOUS must be at least 32 bytes')
  }
  if (previous && !previousId) errors.push('REVIEW_IP_HMAC_KEY_ID_PREVIOUS is required')
  else if (!previous && previousId) {
    errors.push('REVIEW_IP_HMAC_KEY_ID_PREVIOUS requires REVIEW_IP_HMAC_SECRET_PREVIOUS')
  }
  if (previousId && !KEY_ID_PATTERN.test(previousId)) {
    errors.push(`REVIEW_IP_HMAC_KEY_ID_PREVIOUS must match ${REVIEW_KEY_ID_RULE}`)
  }
  if (previousId && keyId && previousId === keyId) {
    errors.push('REVIEW_IP_HMAC_KEY_ID_PREVIOUS must differ from REVIEW_IP_HMAC_KEY_ID')
  }

  if (review && rateLimit && sameSecret(review, rateLimit)) {
    errors.push('REVIEW_IP_HMAC_SECRET must not equal RATE_LIMIT_HMAC_SECRET')
  }
  if (review && previous && sameSecret(review, previous)) {
    errors.push('REVIEW_IP_HMAC_SECRET must not equal REVIEW_IP_HMAC_SECRET_PREVIOUS')
  }

  return errors
}

/** Throws when any rule fails. Build and boot both call this. */
export function assertReviewHmacSecrets(env?: ReviewHmacEnv): void {
  const errors = reviewHmacSecretErrors(env ?? processReviewHmacEnv())
  if (errors.length === 0) return
  throw new Error(errors.join('\n'))
}

function subkey(secret: string, label: string): Buffer {
  if (byteLength(secret) < REVIEW_HMAC_MIN_BYTES) {
    throw new Error('REVIEW_IP_HMAC_SECRET must be at least 32 bytes')
  }
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), label, REVIEW_HMAC_MIN_BYTES))
}

/** HKDF-SHA256 subkey K_ip from REVIEW_IP_HMAC_SECRET. Used later by A5. No fallback key. */
export function K_ip(secret: string = clean(process.env.REVIEW_IP_HMAC_SECRET)): Buffer {
  return subkey(secret, REVIEW_IP_HKDF_LABEL)
}

/** HKDF-SHA256 subkey K_net from REVIEW_IP_HMAC_SECRET. Used later by A5. No fallback key. */
export function K_net(secret: string = clean(process.env.REVIEW_IP_HMAC_SECRET)): Buffer {
  return subkey(secret, REVIEW_NET_HKDF_LABEL)
}

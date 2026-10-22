import { ADMIN_SPONSORS_PRODUCTION_LAUNCH, NEWSLETTER_CTA_PRODUCTION_LAUNCH, USER_RATINGS_PRODUCTION_LAUNCH } from './review-flags'

/** Safe to import from proxy. Does not touch Clerk or the database at runtime. */
export function isClerkConfigured(): boolean {
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? ''
  const secret = process.env.CLERK_SECRET_KEY?.trim() ?? ''
  return publishable.startsWith('pk_') && secret.startsWith('sk_')
}

export type UserRatingsEnv = {
  /** USER_RATINGS. Only the exact value "on" enables the feature. */
  userRatings?: string
  /** VERCEL_ENV. Only preview, development, and test are on. Unset and unknown are off. */
  vercelEnv?: string
}

const NON_PRODUCTION_VERCEL_ENVS = new Set(['preview', 'development', 'test'])

/**
 * Fail closed. The flag must be exactly "on". VERCEL_ENV must be preview,
 * development, or test. An unset or unknown VERCEL_ENV is off. The Node
 * environment is not read. Production stays off unless the launch constant is true.
 */
function enabledInVercelEnv(flag: string | undefined, vercelEnv: string | undefined, productionLaunch: boolean): boolean {
  if (flag?.trim() !== 'on') return false
  const env = vercelEnv?.trim() ?? ''
  if (env === 'production') return productionLaunch
  return NON_PRODUCTION_VERCEL_ENVS.has(env)
}

/**
 * Spec 9.4. Fail closed.
 * True only when USER_RATINGS is exactly "on" and VERCEL_ENV is preview,
 * development, or test. An unset or unknown VERCEL_ENV is off. The Node
 * environment is not consulted. Production stays off unless USER_RATINGS_PRODUCTION_LAUNCH
 * is true.
 * App code calls this with no arguments. Tests pass the env explicitly.
 * While this is false, the proxy 404s the ratings paths.
 * The Clerk deletion webhook is separate and stays active in every environment.
 * This does not read ADMIN_SPONSORS.
 */
export function userRatingsEnabled(
  env: UserRatingsEnv = {
    userRatings: process.env.USER_RATINGS,
    vercelEnv: process.env.VERCEL_ENV,
  },
  productionLaunch: boolean = USER_RATINGS_PRODUCTION_LAUNCH,
): boolean {
  return enabledInVercelEnv(env.userRatings, env.vercelEnv, productionLaunch)
}

export type AdminSponsorsEnv = {
  /** ADMIN_SPONSORS. Only the exact value "on" enables the sponsor admin queue. */
  adminSponsors?: string
  /** VERCEL_ENV. Only preview, development, and test are on. Unset and unknown are off. */
  vercelEnv?: string
}

/**
 * Fail closed, and independent of USER_RATINGS.
 * True only when ADMIN_SPONSORS is exactly "on" and VERCEL_ENV is preview,
 * development, or test. An unset, empty, or any other value is off.
 * Production stays off unless ADMIN_SPONSORS_PRODUCTION_LAUNCH is true.
 * That constant ships false until the A18 real Clerk admin test passes.
 * While this is false, the proxy 404s /admin/sponsors.
 * /admin/mfa-required stays up when this or the ratings flag is on.
 */
export function adminSponsorsEnabled(
  env: AdminSponsorsEnv = {
    adminSponsors: process.env.ADMIN_SPONSORS,
    vercelEnv: process.env.VERCEL_ENV,
  },
  productionLaunch: boolean = ADMIN_SPONSORS_PRODUCTION_LAUNCH,
): boolean {
  return enabledInVercelEnv(env.adminSponsors, env.vercelEnv, productionLaunch)
}

export type NewsletterCtaEnv = {
  /** NEWSLETTER_CTA. Only the exact value "on" enables the CTA. */
  newsletterCta?: string
  /** VERCEL_ENV. Only preview, development, and test are on. Unset and unknown are off. */
  vercelEnv?: string
}

/**
 * Fail closed. The newsletter CTA (inline box + sticky bar) on /compare/*,
 * /alternatives/*, /best/*, and /guides/* renders only when NEWSLETTER_CTA is
 * exactly "on" and VERCEL_ENV is preview, development, or test.
 * Production stays off unless NEWSLETTER_CTA_PRODUCTION_LAUNCH is true.
 * While this is false the server also ignores the CTA's page-path field.
 */
export function newsletterCtaEnabled(
  env: NewsletterCtaEnv = {
    newsletterCta: process.env.NEWSLETTER_CTA,
    vercelEnv: process.env.VERCEL_ENV,
  },
  productionLaunch: boolean = NEWSLETTER_CTA_PRODUCTION_LAUNCH,
): boolean {
  return enabledInVercelEnv(env.newsletterCta, env.vercelEnv, productionLaunch)
}

const RATINGS_EXACT_PATHS = new Set([
  '/admin',
  '/admin/reviews',
  '/admin/reports',
  '/admin/audit',
  '/admin/vendor-domains',
  '/admin/sponsor-links',
  '/admin/mfa-required',
  '/review-guidelines',
  '/how-user-ratings-work',
  '/members/reviews',
])

/**
 * One decode, then lowercase. A bad percent-encoding is left as-is so the
 * check still runs. The proxy calls this before matching a ratings route.
 */
export function normalizeRatingsPath(pathname: string): string {
  let decoded = pathname
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // A bad percent-encoding stays as written. The match still runs.
  }
  if (decoded.length > 1 && decoded.endsWith('/')) decoded = decoded.slice(0, -1)
  return decoded.toLowerCase()
}

/** Ratings routes the proxy hides while userRatingsEnabled() is false. */
export function isRatingsPath(pathname: string): boolean {
  const path = normalizeRatingsPath(pathname)
  if (RATINGS_EXACT_PATHS.has(path)) return true
  if (/^\/tools\/[^/]+\/rate$/.test(path)) return true
  if (/^\/api\/tools\/[^/]+\/reviews$/.test(path)) return true
  return false
}

/** Sponsor queue. /admin/sponsor-links stays a ratings path and is not this route. */
export function isSponsorsAdminPath(pathname: string): boolean {
  const path = normalizeRatingsPath(pathname)
  return path === '/admin/sponsors' || path.startsWith('/admin/sponsors/')
}

/** Shared MFA setup page. Open when ratings or the sponsor admin flag is on. */
export function isAdminMfaPath(pathname: string): boolean {
  return normalizeRatingsPath(pathname) === '/admin/mfa-required'
}

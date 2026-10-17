import { USER_RATINGS_PRODUCTION_LAUNCH } from './review-flags'

/** Safe to import from proxy. Does not touch Clerk or the database at runtime. */
export function isClerkConfigured(): boolean {
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? ''
  const secret = process.env.CLERK_SECRET_KEY?.trim() ?? ''
  return publishable.startsWith('pk_') && secret.startsWith('sk_')
}

export type UserRatingsEnv = {
  /** USER_RATINGS. Only the exact value "on" enables the feature. */
  userRatings?: string
  /** VERCEL_ENV. Unknown values are off. Production stays off unless the launch constant is true. */
  vercelEnv?: string
  /** NODE_ENV. Used only when VERCEL_ENV is unset. The value "production" is off. */
  nodeEnv?: string
}

const RATINGS_VERCEL_ENVS = new Set(['preview', 'development', 'test'])

/**
 * Spec 9.4. Fail closed.
 * True only when USER_RATINGS is exactly "on" and one of these holds:
 * VERCEL_ENV is preview, development, or test;
 * VERCEL_ENV is unset and NODE_ENV is not production;
 * VERCEL_ENV is production and USER_RATINGS_PRODUCTION_LAUNCH is true.
 * Any other VERCEL_ENV is off, including when the launch constant is true.
 * App code calls this with no arguments. Tests pass the env explicitly.
 * While this is false, the proxy 404s the ratings paths.
 * The Clerk deletion webhook is separate and stays active in every environment.
 */
export function userRatingsEnabled(
  env: UserRatingsEnv = {
    userRatings: process.env.USER_RATINGS,
    vercelEnv: process.env.VERCEL_ENV,
    nodeEnv: process.env.NODE_ENV,
  },
  productionLaunch: boolean = USER_RATINGS_PRODUCTION_LAUNCH,
): boolean {
  if (env.userRatings?.trim() !== 'on') return false
  const vercelEnv = env.vercelEnv?.trim() ?? ''
  if (vercelEnv === 'production') return productionLaunch
  if (RATINGS_VERCEL_ENVS.has(vercelEnv)) return true
  if (vercelEnv === '') return (env.nodeEnv?.trim() ?? '') !== 'production'
  return false
}

const RATINGS_EXACT_PATHS = new Set([
  '/admin',
  '/admin/reviews',
  '/admin/reports',
  '/admin/audit',
  '/admin/vendor-domains',
  '/admin/sponsor-links',
  '/review-guidelines',
  '/how-user-ratings-work',
  '/members/reviews',
])

/** Ratings routes the proxy hides while userRatingsEnabled() is false. */
export function isRatingsPath(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (RATINGS_EXACT_PATHS.has(path)) return true
  if (/^\/tools\/[^/]+\/rate$/.test(path)) return true
  if (/^\/api\/tools\/[^/]+\/reviews$/.test(path)) return true
  return false
}

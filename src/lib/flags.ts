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
  /** VERCEL_ENV. The value "production" stays off unless the launch constant is true. */
  vercelEnv?: string
}

/**
 * Spec 9.4. True only when USER_RATINGS is exactly "on" and either VERCEL_ENV
 * is not production or USER_RATINGS_PRODUCTION_LAUNCH is true.
 * App code calls this with no arguments. Tests pass the env explicitly.
 * While this is false, rating UI stays unrendered and the review routes 404.
 * The Clerk deletion webhook is separate and stays active in every environment.
 */
export function userRatingsEnabled(
  env: UserRatingsEnv = {
    userRatings: process.env.USER_RATINGS,
    vercelEnv: process.env.VERCEL_ENV,
  },
  productionLaunch: boolean = USER_RATINGS_PRODUCTION_LAUNCH,
): boolean {
  if (env.userRatings?.trim() !== 'on') return false
  const vercelEnv = env.vercelEnv?.trim() ?? ''
  if (vercelEnv === 'production') return productionLaunch
  return true
}

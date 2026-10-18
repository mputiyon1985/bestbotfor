import { isLiveSecretKey, isTestSecretKey, liveModeAllowed } from './stripe-key'

/** Shown on production /sponsor until live billing is on. */
export const SPONSOR_OPENING_SOON = 'Founding sponsor spots opening soon'

export const SPONSOR_CONTACT_EMAIL = 'mark@bestbotfor.com'

export const SPONSOR_CONTACT_MAILTO = `mailto:${SPONSOR_CONTACT_EMAIL}`

export type SponsorCheckoutSurface = 'live' | 'test' | 'closed'

type SponsorCheckoutEnv = Record<string, string | undefined>

/**
 * Live billing is on only when all three hold: VERCEL_ENV is exactly
 * "production", STRIPE_ALLOW_LIVE is exactly "true", and the secret key uses a
 * live prefix. Preview, test, development, unset, and any case or whitespace
 * variant stay off even with the flag and a live key.
 */
export function sponsorLiveBilling(env: SponsorCheckoutEnv = process.env): boolean {
  const key = env.STRIPE_SECRET_KEY?.trim() ?? ''
  return env.VERCEL_ENV === 'production' && liveModeAllowed(env) && isLiveSecretKey(key)
}

/**
 * Test checkout is allowed only for exact preview or development, or for local
 * dev where VERCEL_ENV is unset and NODE_ENV is not production. Blank values,
 * whitespace, and unknown names stay closed. Live billing still opens checkout.
 */
export function sponsorTestCheckoutAllowed(env: SponsorCheckoutEnv = process.env): boolean {
  const vercelEnv = env.VERCEL_ENV
  if (vercelEnv === 'preview' || vercelEnv === 'development') return true
  return vercelEnv === undefined && env.NODE_ENV !== 'production'
}

/** The test-mode banner and form need a test-mode secret key, not just a non-production env. */
function sponsorTestKey(env: SponsorCheckoutEnv): boolean {
  return isTestSecretKey(env.STRIPE_SECRET_KEY?.trim() ?? '')
}

/** One gate for the page, its metadata, the checkout action, and the checkout route. */
export function sponsorCheckoutSurface(env: SponsorCheckoutEnv = process.env): SponsorCheckoutSurface {
  if (sponsorLiveBilling(env)) return 'live'
  if (sponsorTestCheckoutAllowed(env) && sponsorTestKey(env)) return 'test'
  return 'closed'
}

export function sponsorCheckoutClosed(env: SponsorCheckoutEnv = process.env): boolean {
  return sponsorCheckoutSurface(env) === 'closed'
}

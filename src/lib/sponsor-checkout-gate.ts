import { isLiveSecretKey, liveModeAllowed } from './stripe-key'

/** Shown on production /sponsor until live billing is on. */
export const SPONSOR_OPENING_SOON = 'Founding sponsor spots opening soon'

export const SPONSOR_CONTACT_EMAIL = 'mark@bestbotfor.com'

export const SPONSOR_CONTACT_MAILTO = `mailto:${SPONSOR_CONTACT_EMAIL}`

export type SponsorCheckoutSurface = 'live' | 'test' | 'closed'

type SponsorCheckoutEnv = Record<string, string | undefined>

/**
 * Live billing is on only when STRIPE_ALLOW_LIVE is exactly "true" and the
 * secret key uses a live prefix. Anything else is off.
 */
export function sponsorLiveBilling(env: SponsorCheckoutEnv = process.env): boolean {
  const key = env.STRIPE_SECRET_KEY?.trim() ?? ''
  return liveModeAllowed(env) && isLiveSecretKey(key)
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

export function sponsorCheckoutSurface(env: SponsorCheckoutEnv = process.env): SponsorCheckoutSurface {
  if (sponsorLiveBilling(env)) return 'live'
  if (sponsorTestCheckoutAllowed(env)) return 'test'
  return 'closed'
}

export function sponsorCheckoutClosed(env: SponsorCheckoutEnv = process.env): boolean {
  return sponsorCheckoutSurface(env) === 'closed'
}

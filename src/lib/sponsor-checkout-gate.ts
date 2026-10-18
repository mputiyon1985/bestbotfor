import { isLiveSecretKey, liveModeAllowed } from './stripe-key'

/** Shown on production /sponsor until live billing is on. */
export const SPONSOR_OPENING_SOON = 'Founding sponsor spots opening soon'

export const SPONSOR_CONTACT_EMAIL = 'mark@bestbotfor.com'

export const SPONSOR_CONTACT_MAILTO = `mailto:${SPONSOR_CONTACT_EMAIL}`

export type SponsorCheckoutSurface = 'live' | 'test' | 'closed'

type SponsorCheckoutEnv = Record<string, string | undefined>

/**
 * Live billing is on only when STRIPE_ALLOW_LIVE is exactly "true" and the
 * secret key is an sk_live or rk_live key. Anything else is off.
 */
export function sponsorLiveBilling(env: SponsorCheckoutEnv = process.env): boolean {
  const key = env.STRIPE_SECRET_KEY?.trim() ?? ''
  return liveModeAllowed(env) && isLiveSecretKey(key)
}

/**
 * Test checkout is for preview and local development. Production stays closed
 * until live billing is on. The decision reads the server environment only.
 */
export function sponsorCheckoutSurface(env: SponsorCheckoutEnv = process.env): SponsorCheckoutSurface {
  if (sponsorLiveBilling(env)) return 'live'
  if (env.VERCEL_ENV === 'production') return 'closed'
  return 'test'
}

export function sponsorCheckoutClosed(env: SponsorCheckoutEnv = process.env): boolean {
  return sponsorCheckoutSurface(env) === 'closed'
}

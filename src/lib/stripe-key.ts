/**
 * Live billing stays off unless VERCEL_ENV is exactly "production" and
 * STRIPE_ALLOW_LIVE is the exact string "true". Neither value is trimmed.
 * Going live needs Mark's written approval. The setup script ignores that flag
 * and still refuses every live key.
 */

const LIVE_SECRET_PREFIXES = ['sk_', 'rk_'].map((prefix) => `${prefix}${'live_'}`)

export const STRIPE_API_VERSION = '2026-09-30.endive' as const

export function isLiveSecretKey(key: string): boolean {
  return LIVE_SECRET_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/** Test-mode secret keys only. Live markers anywhere in the key still fail. */
export function isTestSecretKey(key: string): boolean {
  if (!key.startsWith('sk_' + 'test_')) return false
  return !LIVE_SECRET_PREFIXES.some((prefix) => key.includes(prefix))
}

type EnvFlag = Record<string, string | undefined>

export function liveModeAllowed(env: EnvFlag = process.env): boolean {
  return env.VERCEL_ENV === 'production' && env.STRIPE_ALLOW_LIVE === 'true'
}

/** Secret keys that may call the Stripe API. Live keys need production and the explicit flag. */
export function secretKeyAllowed(key: string, env: EnvFlag = process.env): boolean {
  if (isLiveSecretKey(key)) return liveModeAllowed(env)
  return isTestSecretKey(key)
}

/**
 * Product setup is test mode only. STRIPE_ALLOW_LIVE does not unlock it.
 * `_env` is accepted so callers can show they passed the flag through and it was ignored.
 */
export function assertTestSetupKey(key: string, _env?: EnvFlag): void {
  if (!isTestSecretKey(key)) {
    throw new Error('Refusing to create Stripe prices outside test mode')
  }
}

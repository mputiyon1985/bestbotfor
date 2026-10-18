const LIVE_PUBLISHABLE = ['pk_', 'live_'].join('')

/**
 * Clerk's invalid publishable-key message includes this format example.
 * It is documentation, not a key. A real key still matches after this is removed.
 */
const CLERK_KEY_FORMAT_EXAMPLE = ['pk_', 'test_', '... or ', 'pk_', 'live_', '...'].join('')

/** Clerk stores the live prefix as a string and checks it with startsWith. Not a key. */
const CLERK_LIVE_PREFIX_LITERALS = [
  ['startsWith("', 'pk_', 'live_', '")'].join(''),
  ['="', 'pk_', 'live_', '"'].join(''),
]

export const CLIENT_BUNDLE_FORBIDDEN = [
  'libsql://',
  'TURSO_AUTH_TOKEN',
  '@libsql/client',
  'BEEHIIV_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_ALLOW_LIVE',
  'whsec_',
  ['sk_', 'live_'].join(''),
  ['rk_', 'live_'].join(''),
  ['sk_', 'test_'].join(''),
  ['rk_', 'test_'].join(''),
  LIVE_PUBLISHABLE,
] as const

export function scrubClientBundleText(text: string): string {
  let scrubbed = text.split(CLERK_KEY_FORMAT_EXAMPLE).join('')
  for (const literal of CLERK_LIVE_PREFIX_LITERALS) scrubbed = scrubbed.split(literal).join('')
  return scrubbed
}

export function clientBundleHits(text: string, needles: readonly string[]): string[] {
  const scrubbed = scrubClientBundleText(text)
  return needles.filter((needle) => needle.length > 0 && scrubbed.includes(needle))
}

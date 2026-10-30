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
  'CLERK_SECRET_KEY',
  'SIGNUPS_SESSION_SECRET',
  'SIGNUPS_ADMIN_PASSWORD_HASH',
  'SIGNUPS_TOTP_SECRET',
  'SIGNUPS_TURSO_AUTH_TOKEN',
  'SIGNUPS_TURSO_DATABASE_URL',
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

/**
 * Strings that only the SPONSOR_OFFERINGS catalog puts in a chunk: the
 * minified `priceEnv:` property and the Price env var names. Public list
 * pricing, not secrets, but the catalog belongs on the server; the only client
 * importer allowed is the admin card queue. See eslint.config.mjs.
 */
export const CATALOG_CLIENT_FORBIDDEN = ['priceEnv:', 'STRIPE_PRICE_'] as const

/** True for an App Router route under /admin, e.g. "/admin/sponsors/page". */
export function isAdminRoute(route: string): boolean {
  return route === '/admin' || route.startsWith('/admin/')
}

/** Route keys and the static chunk paths ("static/chunks/x.js") in one client-reference manifest file. */
export function parseClientReferenceManifest(text: string): { route: string; chunks: string[] }[] {
  const entries: { route: string; chunks: string[] }[] = []
  const starts = [...text.matchAll(/__RSC_MANIFEST\[("(?:[^"\\]|\\.)*")\]\s*=/g)]
  starts.forEach((match, index) => {
    const end = starts[index + 1]?.index ?? text.length
    const body = text.slice((match.index ?? 0) + match[0].length, end)
    const chunks = new Set<string>()
    for (const chunk of body.matchAll(/"\/?_next\/(static\/[^"]+?\.js)"/g)) if (chunk[1]) chunks.add(chunk[1])
    entries.push({ route: JSON.parse(match[1] ?? '""') as string, chunks: [...chunks] })
  })
  return entries
}

/**
 * Chunks that only admin routes load. A chunk any non-admin route loads, or
 * that no manifest lists, is treated as public.
 */
export function adminOnlyChunks(manifests: readonly { route: string; chunks: readonly string[] }[]): Set<string> {
  const admin = new Set<string>()
  const publicChunks = new Set<string>()
  for (const { route, chunks } of manifests) for (const chunk of chunks) (isAdminRoute(route) ? admin : publicChunks).add(chunk)
  for (const chunk of publicChunks) admin.delete(chunk)
  return admin
}

/**
 * Why a set of parsed client-reference manifests can't be trusted to tell
 * admin-only chunks apart. Empty when every app route in
 * app-paths-manifest.json has a parsed manifest and at least one non-admin
 * route was parsed. A partial set would make shared chunks look admin-only.
 */
export function manifestCoverageProblems(appPaths: readonly string[], parsedRoutes: readonly string[]): string[] {
  const problems: string[] = []
  const parsed = new Set(parsedRoutes)
  if (appPaths.length === 0) problems.push('app-paths-manifest.json lists no app routes')
  if (parsed.size < appPaths.length) {
    problems.push(`parsed ${parsed.size} client-reference manifest route(s), fewer than the ${appPaths.length} app routes`)
  }
  const missing = appPaths.filter((route) => !parsed.has(route))
  if (missing.length > 0) problems.push(`no client-reference manifest for: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', …' : ''}`)
  if (![...parsed].some((route) => !isAdminRoute(route))) problems.push('no non-admin route was parsed')
  return problems
}

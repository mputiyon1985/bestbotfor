/**
 * Per-deploy version for catalog unstable_cache keys. The Vercel Data Cache
 * survives deploys, so without this a deploy that changes seeded catalog data
 * would keep serving the previous deploy's entries for the whole revalidate window.
 * Each deploy gets its own keys: one read per key, then the long window.
 */
export function catalogCacheVersion(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim()
  if (sha && /^[0-9a-f]{7,64}$/i.test(sha)) return `sha-${sha.slice(0, 12).toLowerCase()}`
  const deployment = env.VERCEL_DEPLOYMENT_ID?.trim()
  if (deployment && /^[A-Za-z0-9_-]{1,80}$/.test(deployment)) return `dpl-${deployment}`
  // Local dev, tests and self-hosted builds: a stable fallback (no Vercel Data Cache to go stale).
  return 'local'
}

export function catalogCacheKey(name: string, env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  return [name, `catalog-version:${catalogCacheVersion(env)}`]
}

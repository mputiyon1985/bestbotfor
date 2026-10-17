/**
 * Server boot. The same validator `next.config.ts` runs at build time.
 * Edge bundles do not import it: the helper uses node:crypto.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'edge') return
  const { assertReviewHmacSecrets } = await import('./lib/review-hmac-secrets')
  assertReviewHmacSecrets()
}

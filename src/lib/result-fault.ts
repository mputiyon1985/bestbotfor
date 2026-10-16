/** Faults Playwright can force. Anything else is ignored. */
export const RESULT_FAULTS = ['lookup-throw', 'lookup-slow', 'limit-throw', 'limit-slow', 'db-down'] as const

export type ResultFault = '' | (typeof RESULT_FAULTS)[number]

const FAULT_SET = new Set<string>(RESULT_FAULTS)

/**
 * Playwright sets RESULT_FAULTS=1 and sends x-bbf-result-fault.
 * The header is honored only for an explicit test runtime: NODE_ENV=test,
 * or VERCEL_ENV=preview. Production, an unset env, and any other env deny it.
 */
export function acceptResultFault(
  header: string | null,
  env: { faults?: string; vercelEnv?: string; nodeEnv?: string },
): ResultFault {
  if (env.faults !== '1') return ''
  const vercelEnv = env.vercelEnv?.trim()
  if (vercelEnv === 'production') return ''
  const allowed = env.nodeEnv === 'test' || vercelEnv === 'preview'
  if (!allowed) return ''
  const value = (header ?? '').trim()
  return FAULT_SET.has(value) ? (value as ResultFault) : ''
}

function pending<T>(): Promise<T> {
  return new Promise(() => {})
}

/**
 * Replaces the catalog lookup, the page's follow-up read, or the rate-limit write.
 * `db-down` fails both reads, which is the database still being down when the page would render.
 */
export function faultedResultWork<T>(fault: ResultFault, kind: 'lookup' | 'page' | 'limit', real: () => Promise<T>): () => Promise<T> {
  return () => {
    if (kind === 'lookup' && (fault === 'lookup-throw' || fault === 'db-down')) return Promise.reject(new Error('fault'))
    if (kind === 'lookup' && fault === 'lookup-slow') return pending()
    if (kind === 'page' && fault === 'db-down') return Promise.reject(new Error('fault'))
    if (kind === 'limit' && fault === 'limit-throw') return Promise.reject(new Error('fault'))
    if (kind === 'limit' && fault === 'limit-slow') return pending()
    return real()
  }
}

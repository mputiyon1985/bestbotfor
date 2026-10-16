/** Faults Playwright can force. Anything else is ignored. */
export const RESULT_FAULTS = ['lookup-throw', 'lookup-slow', 'limit-throw', 'limit-slow', 'db-down'] as const

export type ResultFault = '' | (typeof RESULT_FAULTS)[number]

const FAULT_SET = new Set<string>(RESULT_FAULTS)

/**
 * Playwright sets RESULT_FAULTS=1 and sends x-bbf-result-fault.
 * VERCEL_ENV=production ignores the variable and the header, so a client
 * cannot force a fault on the production deployment.
 */
export function acceptResultFault(
  header: string | null,
  env: { faults?: string; vercelEnv?: string },
): ResultFault {
  if (env.vercelEnv?.trim() === 'production') return ''
  if (env.faults !== '1') return ''
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

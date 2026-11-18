export const AUDIT_LEVEL: 'high'

export const ALLOWLIST: readonly {
  id: string
  expires: string
  reason: string
}[]

export function evaluateAudit(
  report: unknown,
  options?: {
    now?: Date
    allowlist?: readonly { id: string; expires: string; reason: string }[]
    lockfile?: {
      // Dev-only means `dev: true`. `devOptional` is not dev-only: production installs can include it.
      packages?: Record<string, { dev?: boolean; version?: string }>
    }
    publishedVersions?: Record<string, readonly string[]>
    /** Raw `npm audit --omit=dev --json` stdout. A waiver requires this string, and stops when it contains the advisory id. */
    omitDevOutput?: string
  },
): {
  ok: boolean
  failures: Array<{ packageName: string; id: string | null; severity: string | null; reason: string }>
  waived: Array<{ packageName: string; id: string | null; severity: string | null; reason: string }>
}

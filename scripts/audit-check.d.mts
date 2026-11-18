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
      packages?: Record<string, { dev?: boolean; devOptional?: boolean; version?: string }>
    }
    publishedVersions?: Record<string, readonly string[]>
  },
): {
  ok: boolean
  failures: Array<{ packageName: string; id: string | null; severity: string | null; reason: string }>
  waived: Array<{ packageName: string; id: string | null; severity: string | null; reason: string }>
}

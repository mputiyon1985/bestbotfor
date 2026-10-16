import guardConfig from '../../../config/db-guard.json'

export type DbGuardConfig = {
  prodHosts: string[]
  prodDbNames: string[]
  nonProductionAllowedHosts: string[]
}

export type DbGuardResult = { ok: true; host: string | null } | { ok: false; host: string | null; reason: string }

export function dbHost(url: string): string | null {
  if (url.startsWith('file:') || url === ':memory:') return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return 'unparseable'
  }
}

// Turso hostnames look like <db>-<org>.<region>.turso.io.
function matchesProdName(host: string, names: string[]): boolean {
  if (!host.endsWith('.turso.io')) return false
  const label = host.split('.')[0] ?? ''
  return names.some((name) => label === name || (label.startsWith(`${name}-`) && !label.startsWith(`${name}-preview`)))
}

export function checkDbTarget(
  url: string,
  vercelEnv: string | undefined,
  config: DbGuardConfig = guardConfig as DbGuardConfig,
): DbGuardResult {
  const host = dbHost(url)
  if (host === null) return { ok: true, host }
  if (vercelEnv === 'production') return { ok: true, host }
  const isProd =
    config.prodHosts.map((h) => h.toLowerCase()).includes(host) || matchesProdName(host, config.prodDbNames)
  if (isProd) {
    return {
      ok: false,
      host,
      reason: `Refusing to migrate/seed production DB host ${host}: VERCEL_ENV is "${vercelEnv ?? 'unset'}", not "production".`,
    }
  }
  if (vercelEnv && !config.nonProductionAllowedHosts.map((h) => h.toLowerCase()).includes(host)) {
    return {
      ok: false,
      host,
      reason: `Refusing to migrate/seed DB host ${host} from a ${vercelEnv} build: only ${config.nonProductionAllowedHosts.join(', ')} is allowed outside production.`,
    }
  }
  return { ok: true, host }
}

export function assertSafeDbTarget(url: string, vercelEnv = process.env.VERCEL_ENV): void {
  const result = checkDbTarget(url, vercelEnv)
  if (!result.ok) {
    console.error(`DB guard: ${result.reason}`)
    process.exit(1)
  }
  console.log(`DB guard: VERCEL_ENV=${vercelEnv ?? 'unset'}, DB host ${result.host ?? 'local file'}`)
}

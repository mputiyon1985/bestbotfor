import guardConfig from '../../../config/db-guard.json'

export type DbGuardConfig = {
  prodHosts: string[]
  prodDbNames: string[]
  nonProductionAllowedHosts: string[]
}

export type DbGuardResult = { ok: true; host: string | null } | { ok: false; host: string | null; reason: string }

// Mirrors the URI and authority parsing in @libsql/core 0.18 (lib-esm/uri.js), so the guard
// classifies the same host the libsql client will actually connect to.
const URI_RE = new RegExp('^(?<scheme>[A-Za-z][A-Za-z.+-]*):(//(?<authority>[^/?#]*))?(?<path>[^?#]*)(\\?(?<query>[^#]*))?(#(?<fragment>.*))?$', 'su')
const AUTHORITY_RE = new RegExp(
  '^((?<username>[^:]*)(:(?<password>.*))?@)?((?<host>[^:\\[\\]]*)|(\\[(?<host_br>[^\\[\\]]*)\\]))(:(?<port>[0-9]*))?$',
  'su',
)

export const UNPARSEABLE = 'unparseable'

/** Lowercase and strip trailing dots so "Host.Turso.IO." and "host.turso.io" classify the same. */
export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.+$/, '')
}

/** Host libsql would connect to, normalized; null for local file/memory DBs. */
export function dbHost(url: string): string | null {
  if (url === ':memory:') return null
  const match = URI_RE.exec(url)
  if (!match?.groups) return UNPARSEABLE
  if ((match.groups.scheme ?? '').toLowerCase() === 'file') return null
  const authority = match.groups.authority
  if (authority === undefined) return UNPARSEABLE
  const parts = AUTHORITY_RE.exec(authority)
  if (!parts?.groups) return UNPARSEABLE
  const raw = parts.groups.host_br ?? parts.groups.host ?? ''
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return UNPARSEABLE
  }
  const host = normalizeHost(decoded)
  return host || UNPARSEABLE
}

// Turso hostnames look like <db>-<org>.<region>.turso.io.
function matchesProdName(host: string, names: string[]): boolean {
  if (!host.endsWith('.turso.io')) return false
  const label = host.split('.')[0] ?? ''
  return names.some((name) => label === name || (label.startsWith(`${name}-`) && !label.startsWith(`${name}-preview`)))
}

export function isProdHost(host: string, config: DbGuardConfig = guardConfig as DbGuardConfig): boolean {
  return config.prodHosts.map(normalizeHost).includes(host) || matchesProdName(host, config.prodDbNames)
}

/**
 * VERCEL_ENV=production may use any host. Everything else, including a missing or empty
 * VERCEL_ENV, fails closed: prod hosts are refused and only allowlisted remote hosts pass.
 * Local file: DBs are always allowed.
 */
export function checkDbTarget(
  url: string,
  vercelEnv: string | undefined,
  config: DbGuardConfig = guardConfig as DbGuardConfig,
): DbGuardResult {
  const host = dbHost(url)
  if (host === null) return { ok: true, host }
  const env = vercelEnv?.trim() || undefined
  if (env === 'production') return { ok: true, host }
  const label = env ?? 'unset'
  if (isProdHost(host, config)) {
    return {
      ok: false,
      host,
      reason: `Refusing to migrate/seed production DB host ${host}: VERCEL_ENV is "${label}", not "production".`,
    }
  }
  if (!config.nonProductionAllowedHosts.map(normalizeHost).includes(host)) {
    return {
      ok: false,
      host,
      reason: `Refusing to migrate/seed DB host ${host} with VERCEL_ENV "${label}": outside production only local file: DBs and ${config.nonProductionAllowedHosts.join(', ')} are allowed.`,
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
  console.log(`DB guard: VERCEL_ENV=${vercelEnv?.trim() || 'unset'}, DB host ${result.host ?? 'local file'}`)
}

/** Throwing variant for library code (applyMigrations) that must not exit the process. */
export function requireSafeDbTarget(url: string, vercelEnv = process.env.VERCEL_ENV): void {
  const result = checkDbTarget(url, vercelEnv)
  if (!result.ok) throw new Error(`DB guard: ${result.reason}`)
}

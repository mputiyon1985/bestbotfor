/** Apex origin for production Checkout returns. */
export const SPONSOR_PRODUCTION_ORIGIN = 'https://bestbotfor.com'

const SUCCESS_PATH = '/sponsor/success?session_id={CHECKOUT_SESSION_ID}'
const CANCEL_PATH = '/sponsor/cancel'

/** Deployments of this project on Vercel, not any other vercel.app host. */
const PROJECT_VERCEL_HOST = /^bestbotfor(?:-[a-z0-9-]+)?\.vercel\.app$/

const APEX_HOSTS = new Set(['bestbotfor.com', 'www.bestbotfor.com'])

export type SponsorReturnEnv = {
  VERCEL_ENV?: string
  VERCEL_URL?: string
  VERCEL_BRANCH_URL?: string
  NEXT_PUBLIC_SITE_URL?: string
}

/**
 * Origin Stripe should send the buyer back to.
 * Production is always the apex. On preview, this project's deployment URL
 * wins over an apex or www Origin. Loopback http is allowed only when the
 * request host is itself loopback and this is not production.
 * NEXT_PUBLIC_SITE_URL is not a candidate.
 */
export function sponsorReturnOrigin(
  input: { requestOrigin?: string | null; requestHost?: string | null; env?: SponsorReturnEnv } = {},
): string {
  const env = input.env ?? {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
  }
  const vercelEnv = env.VERCEL_ENV?.trim()
  if (vercelEnv === 'production') return SPONSOR_PRODUCTION_ORIGIN

  const trusted = trustedDeploymentHosts(env)
  const loopback = loopbackRequest(input.requestHost, input.requestOrigin)
  const branch = deploymentCandidate(env.VERCEL_BRANCH_URL)
  const deployment = deploymentCandidate(env.VERCEL_URL)
  const candidates = vercelEnv === 'preview'
    ? [branch, deployment, input.requestOrigin]
    : [input.requestOrigin, branch, deployment]
  for (const candidate of candidates) {
    const allowed = allowedReturnOrigin(candidate, trusted, loopback)
    if (!allowed) continue
    if (vercelEnv === 'preview' && trusted.size > 0 && isApexOrigin(allowed)) continue
    return allowed
  }
  return SPONSOR_PRODUCTION_ORIGIN
}

export function sponsorReturnUrls(origin: string): { successUrl: string; cancelUrl: string } {
  return {
    successUrl: `${origin}${SUCCESS_PATH}`,
    cancelUrl: `${origin}${CANCEL_PATH}`,
  }
}

/** Origin header, otherwise a single forwarded host, otherwise host. */
export function requestOriginFromHeaders(headerStore: { get(name: string): string | null }): string | null {
  const origin = singleHeader(headerStore.get('origin'))
  if (origin) return origin

  const host = requestHostFromHeaders(headerStore)
  if (!host) return null
  const forwardedProto = singleHeader(headerStore.get('x-forwarded-proto'))
  const proto = forwardedProto ?? (isLoopbackHost(hostName(host)) ? 'http' : 'https')
  if (proto !== 'https' && proto !== 'http') return null
  return `${proto}://${host}`
}

/** The request's own host. Origin is not a host. */
export function requestHostFromHeaders(headerStore: { get(name: string): string | null }): string | null {
  return singleHeader(headerStore.get('x-forwarded-host')) ?? singleHeader(headerStore.get('host'))
}

function trustedDeploymentHosts(env: SponsorReturnEnv): Set<string> {
  const hosts = new Set<string>()
  for (const raw of [env.VERCEL_BRANCH_URL, env.VERCEL_URL]) {
    const host = projectVercelHost(deploymentCandidate(raw))
    if (host) hosts.add(host)
  }
  return hosts
}

function deploymentCandidate(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || hasUnsafeOriginChars(trimmed)) return null
  if (trimmed.includes('://')) return trimmed
  return `https://${trimmed}`
}

type LoopbackRequest = { host: string; port: string }

function allowedReturnOrigin(
  value: string | null | undefined,
  trustedVercelHosts: ReadonlySet<string>,
  loopback: LoopbackRequest | null,
): string | null {
  if (!value || hasUnsafeOriginChars(value)) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.username || url.password) return null
  if (url.pathname !== '/' || url.search || url.hash) return null

  const host = canonicalHost(url.hostname)
  if (!host) return null

  if (url.protocol === 'http:' && loopback && host === loopback.host && url.port === loopback.port) {
    const port = url.port ? `:${url.port}` : ''
    return `http://${host}${port}`
  }

  if (url.protocol !== 'https:' || url.port !== '') return null
  if (APEX_HOSTS.has(host)) return `https://${host}`
  if (PROJECT_VERCEL_HOST.test(host) && trustedVercelHosts.has(host)) return `https://${host}`
  return null
}

function loopbackRequest(requestHost: string | null | undefined, requestOrigin: string | null | undefined): LoopbackRequest | null {
  const headerHost = requestHost?.trim()
  if (headerHost) {
    const host = hostName(headerHost)
    if (!isLoopbackHost(host)) return null
    return { host, port: portFromHost(headerHost) }
  }
  if (!requestOrigin || hasUnsafeOriginChars(requestOrigin)) return null
  try {
    const url = new URL(requestOrigin)
    const host = canonicalHost(url.hostname)
    if (url.protocol !== 'http:' || !host || !isLoopbackHost(host)) return null
    return { host, port: url.port }
  } catch {
    return null
  }
}

function portFromHost(host: string): string {
  if (host.startsWith('[')) return ''
  const split = host.split(':')
  return split.length > 1 ? (split[1] ?? '') : ''
}

function isApexOrigin(origin: string): boolean {
  try {
    return APEX_HOSTS.has(new URL(origin).hostname)
  } catch {
    return false
  }
}

function projectVercelHost(value: string | null): string | null {
  if (!value || hasUnsafeOriginChars(value)) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.username || url.password || url.port) return null
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) return null
  const host = canonicalHost(url.hostname)
  if (!host || !PROJECT_VERCEL_HOST.test(host)) return null
  return host
}

function canonicalHost(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host.length > 253 || host.includes('..')) return null
  if (!/^[a-z0-9.-]+$/.test(host)) return null
  return host
}

function hostName(host: string): string {
  if (host.startsWith('[')) return host
  return host.split(':')[0] ?? host
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1'
}

function singleHeader(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes(',') || hasUnsafeOriginChars(trimmed)) return null
  return trimmed
}

function hasUnsafeOriginChars(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code <= 32 || char === ',' || char === '\\' || char === '@') return true
  }
  return false
}

import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

/** Keys produced by A1b `reviewHmacKeys()`. This module does not read the review secret. */
export type ReviewHmacKeys = {
  ipKey: Uint8Array
  netKey: Uint8Array
  keyId: string
}

export type StoredIpHashes = {
  ipHmac: string
  netHmac: string
  ipKeyId: string
}

export type HeaderSource = {
  get(name: string): string | null | undefined
}

export type VercelRuntimeEnv = {
  vercel?: string
  vercelEnv?: string
  vercelRegion?: string
}

let testIpHookRefusals = 0

export function readTestIpHookRefusals(): number {
  return testIpHookRefusals
}

export function resetTestIpHookRefusals(): void {
  testIpHookRefusals = 0
}

/** True only when VERCEL, VERCEL_ENV, and VERCEL_REGION all agree this is a Vercel deployment. */
export function isVercelDeployment(env: VercelRuntimeEnv): boolean {
  const region = env.vercelRegion?.trim() ?? ''
  const deployed = env.vercelEnv === 'production' || env.vercelEnv === 'preview'
  return env.vercel === '1' && deployed && region.length > 0
}

/** Same rule as isVercelDeployment. */
export function isOnVercel(env: VercelRuntimeEnv): boolean {
  return isVercelDeployment(env)
}

export function canonicalIp(value: string): string | null {
  const raw = value.trim()
  if (raw.length === 0 || raw.length > 64 || raw.includes('%') || raw.includes('/')) return null
  if (isIP(raw) === 4) return canonicalV4(raw)
  if (isIP(raw) === 6) return canonicalV6(raw)
  return null
}

function canonicalV4(value: string): string | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    if (part.length > 1 && part.startsWith('0')) return null
    const octet = Number(part)
    if (!Number.isInteger(octet) || octet > 255) return null
    octets.push(octet)
  }
  return octets.join('.')
}

function canonicalV6(value: string): string | null {
  const lower = value.toLowerCase()
  const zone = lower.split('%')[0] ?? lower
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(zone)
  if (mapped?.[1]) return canonicalV4(mapped[1])
  const halves = zone.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  if (halves.length === 1 && left.length !== 8) return null
  const missing = 8 - left.length - right.length
  if (halves.length === 2 && missing < 0) return null
  const groups = [...left, ...Array(Math.max(missing, 0)).fill('0'), ...right]
  if (groups.length !== 8) return null
  const expanded: string[] = []
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null
    expanded.push(group.padStart(4, '0'))
  }
  const ipv4Mapped =
    expanded[0] === '0000' &&
    expanded[1] === '0000' &&
    expanded[2] === '0000' &&
    expanded[3] === '0000' &&
    expanded[4] === '0000' &&
    expanded[5] === 'ffff'
  if (ipv4Mapped) {
    const high = Number.parseInt(expanded[6] ?? '', 16)
    const low = Number.parseInt(expanded[7] ?? '', 16)
    return canonicalV4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
  }
  return expanded.join(':')
}

/** IPv4 /24 or IPv6 /48. IPv4-mapped IPv6 uses the IPv4 /24. */
export function networkPrefix(value: string): string | null {
  const ip = canonicalIp(value)
  if (!ip) return null
  if (!ip.includes(':')) {
    const [a, b, c] = ip.split('.')
    return `${a}.${b}.${c}.0/24`
  }
  const groups = ip.split(':')
  return `${groups[0]}:${groups[1]}:${groups[2]}::/48`
}

function hmac(key: Uint8Array, message: string): string {
  return createHmac('sha256', key).update(message).digest('hex')
}

/** Stored hashes only. The raw address and the prefix are not returned. */
export function ipHashes(value: string, keys: ReviewHmacKeys): StoredIpHashes | null {
  const ip = canonicalIp(value)
  const prefix = ip ? networkPrefix(ip) : null
  if (!ip || !prefix) return null
  return {
    ipHmac: hmac(keys.ipKey, `bestbotfor-review-ip|v1|${ip}`),
    netHmac: hmac(keys.netKey, `bestbotfor-review-net|v1|${prefix}`),
    ipKeyId: keys.keyId,
  }
}

function firstHeader(headers: HeaderSource, name: string): string | null {
  const value = headers.get(name)
  if (typeof value !== 'string') return null
  const first = value.split(',')[0]?.trim() ?? ''
  return first.length > 0 ? first : null
}

function trustedHeaderIp(headers: HeaderSource): string | null {
  const vercel = firstHeader(headers, 'x-vercel-forwarded-for')
  if (vercel !== null) return canonicalIp(vercel)
  const forwarded = firstHeader(headers, 'x-forwarded-for')
  if (forwarded !== null) return canonicalIp(forwarded)
  return null
}

/**
 * Test hook. The header name lives in this branch so a build without
 * BBF_E2E_HOOKS=1 can drop it. A refusal increments a counter and does not log an IP.
 */
function testHookIp(headers: HeaderSource, env: VercelRuntimeEnv): string | null | undefined {
  if (process.env.BBF_E2E_HOOKS !== '1') return undefined
  const header = firstHeader(headers, 'x-bbf-test-ip')
  if (header === null) return undefined
  if (isVercelDeployment(env) || env.vercelEnv === 'production') {
    testIpHookRefusals += 1
    return undefined
  }
  return canonicalIp(header)
}

/** Header IP on a Vercel deployment, the test hook outside production, or null. */
export function trustedClientIp(headers: HeaderSource, env: VercelRuntimeEnv): string | null {
  const hooked = testHookIp(headers, env)
  if (hooked !== undefined) return hooked
  if (!isVercelDeployment(env)) return null
  return trustedHeaderIp(headers)
}

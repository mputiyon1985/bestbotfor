import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  canonicalIp,
  ipHashes,
  isOnVercel,
  isVercelDeployment,
  networkPrefix,
  readTestIpHookRefusals,
  resetTestIpHookRefusals,
  trustedClientIp,
  type HeaderSource,
  type ReviewHmacKeys,
  type VercelRuntimeEnv,
} from './ip'

const keys: ReviewHmacKeys = {
  ipKey: new TextEncoder().encode('review-ip-test-key-32-bytes-long!!'),
  netKey: new TextEncoder().encode('review-net-test-key-32-bytes-long!'),
  keyId: 'k1',
}

const onVercel: VercelRuntimeEnv = { vercel: '1', vercelEnv: 'production', vercelRegion: 'iad1' }

function headers(values: Record<string, string>): HeaderSource {
  return { get: (name) => values[name.toLowerCase()] ?? null }
}

afterEach(() => {
  delete process.env.BBF_E2E_HOOKS
  resetTestIpHookRefusals()
})

describe('isVercelDeployment', () => {
  const cases: { name: string; env: VercelRuntimeEnv; expected: boolean }[] = [
    { name: 'production with region', env: onVercel, expected: true },
    { name: 'preview with region', env: { vercel: '1', vercelEnv: 'preview', vercelRegion: 'sfo1' }, expected: true },
    { name: 'VERCEL=1 without region', env: { vercel: '1', vercelEnv: 'production', vercelRegion: '' }, expected: false },
    { name: 'VERCEL=1 without region field', env: { vercel: '1', vercelEnv: 'preview' }, expected: false },
    { name: 'region set but VERCEL unset', env: { vercelEnv: 'production', vercelRegion: 'iad1' }, expected: false },
    { name: 'development', env: { vercel: '1', vercelEnv: 'development', vercelRegion: 'iad1' }, expected: false },
    { name: 'test', env: { vercel: '1', vercelEnv: 'test', vercelRegion: 'iad1' }, expected: false },
    { name: 'VERCEL is not 1', env: { vercel: '0', vercelEnv: 'production', vercelRegion: 'iad1' }, expected: false },
    { name: 'blank region', env: { vercel: '1', vercelEnv: 'production', vercelRegion: '   ' }, expected: false },
  ]

  it('is true only when VERCEL, VERCEL_ENV, and VERCEL_REGION agree', () => {
    for (const item of cases) {
      expect(isVercelDeployment(item.env), item.name).toBe(item.expected)
      expect(isOnVercel(item.env), item.name).toBe(item.expected)
    }
  })
})

describe('trustedClientIp', () => {
  it('trusts the Vercel header, then the first forwarded header, only on Vercel', () => {
    expect(
      trustedClientIp(headers({ 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '198.51.100.4' }), onVercel),
    ).toBe('203.0.113.7')
    expect(trustedClientIp(headers({ 'x-forwarded-for': '203.0.113.7, 198.51.100.4' }), onVercel)).toBe('203.0.113.7')
    expect(trustedClientIp(headers({ 'x-vercel-forwarded-for': 'not-an-ip' }), onVercel)).toBeNull()
    expect(trustedClientIp(headers({}), onVercel)).toBeNull()
    expect(trustedClientIp(headers({ 'x-forwarded-for': '203.0.113.7' }), { vercel: '1', vercelEnv: 'production' })).toBeNull()
    expect(
      trustedClientIp(headers({ 'x-forwarded-for': '203.0.113.7' }), { vercelEnv: 'development' }),
    ).toBeNull()
    expect(trustedClientIp(headers({ 'x-forwarded-for': '999.1.1.1' }), onVercel)).toBeNull()
  })

  it('reads the test IP only when BBF_E2E_HOOKS is 1 and the runtime is not Vercel or production', () => {
    const forged = headers({ 'x-bbf-test-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.4' })
    expect(trustedClientIp(forged, { vercelEnv: 'development' })).toBeNull()

    process.env.BBF_E2E_HOOKS = '1'
    expect(trustedClientIp(forged, { vercelEnv: 'test' })).toBe('203.0.113.7')
    expect(trustedClientIp(forged, onVercel)).toBe('198.51.100.4')
    expect(readTestIpHookRefusals()).toBe(1)
    expect(trustedClientIp(forged, { vercelEnv: 'production' })).toBeNull()
    expect(readTestIpHookRefusals()).toBe(2)
    expect(trustedClientIp(headers({ 'x-bbf-test-ip': 'nope' }), { vercelEnv: 'development' })).toBeNull()
  })
})

describe('ip hashes', () => {
  it('shares a net hash inside an IPv4 /24 and an IPv6 /48, including mapped IPv6', () => {
    const first = ipHashes('203.0.113.7', keys)
    const second = ipHashes('203.0.113.200', keys)
    const other = ipHashes('203.0.114.7', keys)
    expect(first?.ipHmac).not.toBe(second?.ipHmac)
    expect(first?.netHmac).toBe(second?.netHmac)
    expect(first?.netHmac).not.toBe(other?.netHmac)
    expect(first?.ipKeyId).toBe('k1')
    expect(networkPrefix('203.0.113.7')).toBe('203.0.113.0/24')
    expect(networkPrefix('::ffff:203.0.113.7')).toBe('203.0.113.0/24')
    expect(networkPrefix('0:0:0:0:0:ffff:cb00:7107')).toBe('203.0.113.0/24')
    expect(ipHashes('::ffff:203.0.113.7', keys)?.ipHmac).toBe(first?.ipHmac)

    const v6a = ipHashes('2001:db8:1234::1', keys)
    const v6b = ipHashes('2001:db8:1234:ffff::2', keys)
    const v6c = ipHashes('2001:db8:1235::1', keys)
    expect(v6a?.netHmac).toBe(v6b?.netHmac)
    expect(v6a?.ipHmac).not.toBe(v6b?.ipHmac)
    expect(v6a?.netHmac).not.toBe(v6c?.netHmac)
    expect(canonicalIp('nope')).toBeNull()
    expect(ipHashes('999.1.1.1', keys)).toBeNull()

    expect(Object.keys(first ?? {}).sort()).toEqual(['ipHmac', 'ipKeyId', 'netHmac'])
    expect(JSON.stringify(first)).not.toContain('203.0.113')
  })

  it('keeps the test header name behind the hooks comparison', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/lib/reviews/ip.ts'), 'utf8')
    const hook = source.indexOf('x-bbf-test-ip')
    const gate = source.lastIndexOf("process.env.BBF_E2E_HOOKS !== '1'", hook)
    expect(hook).toBeGreaterThan(gate)
    expect(gate).toBeGreaterThan(-1)
  })
})

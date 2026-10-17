import { createHash, hkdfSync, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  K_ip,
  K_net,
  REVIEW_HMAC_MIN_BYTES,
  REVIEW_IP_HKDF_LABEL,
  REVIEW_KEY_ID_RULE,
  REVIEW_NET_HKDF_LABEL,
  assertReviewHmacSecrets,
  reviewHmacSecretErrors,
  type ReviewHmacEnv,
} from './review-hmac-secrets'

/**
 * Secret alphabet is outside the validator's error text, so every substring
 * of a secret is absent from the message, not only the whole value.
 * § ¤ µ ¶ are U+00A7 U+00A4 U+00B5 U+00B6 (2 bytes). € is U+20AC (3 bytes).
 */
const IP = '§'.repeat(16)
const RATE = '¤'.repeat(16)
const PREV = 'µ'.repeat(16)
const OTHER = '¶'.repeat(16)
const SHORT = `${'§'.repeat(14)}€`
const ENV_NAMES = [
  'REVIEW_IP_HMAC_SECRET',
  'REVIEW_IP_HMAC_KEY_ID',
  'REVIEW_IP_HMAC_SECRET_PREVIOUS',
  'REVIEW_IP_HMAC_KEY_ID_PREVIOUS',
  'RATE_LIMIT_HMAC_SECRET',
  'USER_RATINGS',
  'VERCEL_ENV',
  'VERCEL',
  'BBF_E2E_HOOKS',
] as const

const previousEnv = new Map<string, string | undefined>(ENV_NAMES.map((name) => [name, process.env[name]]))

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = previousEnv.get(name)
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  vi.restoreAllMocks()
})

function bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function assertNoSecretSubstring(message: string, secrets: string[]): void {
  for (const secret of secrets) {
    expect(secret.length).toBeGreaterThan(0)
    for (const character of new Set(secret)) {
      expect(message).not.toContain(character)
    }
    for (let size = 1; size <= secret.length; size += 1) {
      for (let index = 0; index <= secret.length - size; index += 1) {
        expect(message).not.toContain(secret.slice(index, index + size))
      }
    }
  }
}

function label(env: ReviewHmacEnv): string {
  return [
    `vercelEnv=${env.vercelEnv ?? ''}`,
    `ratings=${JSON.stringify(env.userRatings ?? '')}`,
    `vercel=${env.vercel ?? ''}`,
    `node=${env.nodeEnv ?? ''}`,
    `hooks=${env.bbfE2eHooks ?? ''}`,
    `reviewBytes=${bytes(env.reviewIpHmacSecret?.trim() ?? '')}`,
    `rateBytes=${bytes(env.rateLimitHmacSecret?.trim() ?? '')}`,
    `prevBytes=${bytes(env.reviewIpHmacSecretPrevious?.trim() ?? '')}`,
    `key=${env.reviewIpHmacKeyId ?? ''}`,
    `prevKey=${env.reviewIpHmacKeyIdPrevious ?? ''}`,
  ].join(' ')
}

function expectRules(env: ReviewHmacEnv, expected: string[] = [], secrets: string[] = [IP, RATE, PREV, OTHER, SHORT]): void {
  const errors = reviewHmacSecretErrors(env)
  expect(errors, label(env)).toEqual(expected)
  const message = errors.join('\n')
  assertNoSecretSubstring(message, secrets.filter((secret) => secret.length > 0))
  if (expected.length === 0) {
    expect(() => assertReviewHmacSecrets(env)).not.toThrow()
    return
  }
  try {
    assertReviewHmacSecrets(env)
    throw new Error('validator returned')
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    if (!(error instanceof Error)) return
    expect(error.message).toBe(message)
    expect(error.stack ?? '').not.toContain('§')
    expect(error.stack ?? '').not.toContain('¤')
    expect(JSON.stringify(error)).toBe('{}')
  }
}

function valid(overrides: ReviewHmacEnv = {}): ReviewHmacEnv {
  return {
    vercelEnv: 'production',
    nodeEnv: 'production',
    userRatings: undefined,
    vercel: undefined,
    bbfE2eHooks: undefined,
    reviewIpHmacSecret: IP,
    reviewIpHmacKeyId: 'k1',
    rateLimitHmacSecret: RATE,
    reviewIpHmacSecretPrevious: undefined,
    reviewIpHmacKeyIdPrevious: undefined,
    ...overrides,
  }
}

describe('review HMAC secret validator', () => {
  it('uses secrets whose byte lengths sit on the 32-byte line', () => {
    expect(bytes(IP)).toBe(32)
    expect(bytes(RATE)).toBe(32)
    expect(bytes(PREV)).toBe(32)
    expect(bytes(SHORT)).toBe(31)
    expect(REVIEW_HMAC_MIN_BYTES).toBe(32)
  })

  it('accepts a valid production set and ignores blank optional previous values', () => {
    expectRules(valid())
    expectRules(valid({ reviewIpHmacSecretPrevious: '   ', reviewIpHmacKeyIdPrevious: '  ' }))
    expectRules(valid({ reviewIpHmacSecret: `  ${IP}  `, rateLimitHmacSecret: ` ${RATE}\n`, reviewIpHmacKeyId: ' k1 ' }))
  })

  it('requires the review secret in production and whenever USER_RATINGS=on', () => {
    const vercelEnvs = [undefined, '', 'preview', 'development', 'production', ' production ', 'Production', 'staging'] as const
    const ratings = [undefined, '', '   ', 'on', ' on ', 'off', 'ON', 'yes', 'false'] as const
    for (const vercelEnv of vercelEnvs) {
      for (const userRatings of ratings) {
        const required = vercelEnv?.trim() === 'production' || userRatings?.trim() === 'on'
        const production = vercelEnv?.trim() === 'production'
        const missing = valid({
          vercelEnv,
          userRatings,
          nodeEnv: 'test',
          reviewIpHmacSecret: undefined,
          reviewIpHmacKeyId: undefined,
          rateLimitHmacSecret: production ? RATE : undefined,
        })
        const expected: string[] = []
        if (required) {
          expected.push('REVIEW_IP_HMAC_SECRET is required')
          expected.push('REVIEW_IP_HMAC_KEY_ID is required')
        }
        expectRules(missing, expected)
        expectRules(
          valid({
            vercelEnv,
            userRatings,
            nodeEnv: 'development',
            rateLimitHmacSecret: production ? RATE : undefined,
          }),
          [],
        )
      }
    }
  })

  it('rejects a review secret under 32 bytes whenever it is set, including outside production', () => {
    expectRules(valid({ reviewIpHmacSecret: SHORT }), ['REVIEW_IP_HMAC_SECRET must be at least 32 bytes'])
    expectRules(valid({ vercelEnv: 'preview', nodeEnv: 'development', userRatings: undefined, reviewIpHmacSecret: SHORT, rateLimitHmacSecret: undefined }), [
      'REVIEW_IP_HMAC_SECRET must be at least 32 bytes',
    ])
    expectRules(valid({ vercelEnv: 'preview', userRatings: 'on', nodeEnv: 'development', reviewIpHmacSecret: SHORT }), [
      'REVIEW_IP_HMAC_SECRET must be at least 32 bytes',
    ])
    expectRules(valid({ reviewIpHmacSecret: `${'§'.repeat(16)}` }))
    expectRules(valid({ reviewIpHmacSecret: '§'.repeat(24), rateLimitHmacSecret: '¤'.repeat(24) }))
  })

  it('requires a key id with the secret and checks ^k[1-9][0-9]{0,3}$', () => {
    const rule = `REVIEW_IP_HMAC_KEY_ID must match ${REVIEW_KEY_ID_RULE}`
    expect(REVIEW_KEY_ID_RULE).toBe('^k[1-9][0-9]{0,3}$')
    expectRules(valid({ reviewIpHmacKeyId: undefined }), ['REVIEW_IP_HMAC_KEY_ID is required'])
    expectRules(valid({ reviewIpHmacKeyId: '   ' }), ['REVIEW_IP_HMAC_KEY_ID is required'])
    for (const reviewIpHmacKeyId of ['k1', 'k9', 'k10', 'k9999', ' k42 ']) {
      expectRules(valid({ reviewIpHmacKeyId }))
    }
    for (const reviewIpHmacKeyId of ['k', 'k0', 'k00', 'k01', 'k10000', 'K1', 'kk1', 'k-1', 'key1', '1']) {
      expectRules(valid({ reviewIpHmacKeyId }), [rule])
    }
    expectRules(valid({ reviewIpHmacKeyId: IP }), [rule])
    expectRules(valid({ vercelEnv: 'preview', nodeEnv: 'development', userRatings: 'off', reviewIpHmacSecret: undefined, reviewIpHmacKeyId: 'k1', rateLimitHmacSecret: undefined }))
    expectRules(valid({ vercelEnv: 'preview', nodeEnv: 'development', userRatings: 'off', reviewIpHmacSecret: undefined, reviewIpHmacKeyId: 'nope', rateLimitHmacSecret: 'short' }), [
      rule,
    ])
  })

  it('checks an optional previous secret and refuses a previous id without one', () => {
    const format = `REVIEW_IP_HMAC_KEY_ID_PREVIOUS must match ${REVIEW_KEY_ID_RULE}`
    expectRules(valid({ reviewIpHmacSecretPrevious: PREV, reviewIpHmacKeyIdPrevious: 'k2' }))
    expectRules(valid({ reviewIpHmacSecretPrevious: PREV, reviewIpHmacKeyIdPrevious: undefined }), [
      'REVIEW_IP_HMAC_KEY_ID_PREVIOUS is required',
    ])
    expectRules(valid({ reviewIpHmacSecretPrevious: SHORT, reviewIpHmacKeyIdPrevious: 'k2' }), [
      'REVIEW_IP_HMAC_SECRET_PREVIOUS must be at least 32 bytes',
    ])
    expectRules(valid({ reviewIpHmacSecretPrevious: SHORT, reviewIpHmacKeyIdPrevious: undefined }), [
      'REVIEW_IP_HMAC_SECRET_PREVIOUS must be at least 32 bytes',
      'REVIEW_IP_HMAC_KEY_ID_PREVIOUS is required',
    ])
    expectRules(valid({ reviewIpHmacSecretPrevious: undefined, reviewIpHmacKeyIdPrevious: 'k2' }), [
      'REVIEW_IP_HMAC_KEY_ID_PREVIOUS requires REVIEW_IP_HMAC_SECRET_PREVIOUS',
    ])
    expectRules(valid({ reviewIpHmacSecretPrevious: undefined, reviewIpHmacKeyIdPrevious: 'nope' }), [
      'REVIEW_IP_HMAC_KEY_ID_PREVIOUS requires REVIEW_IP_HMAC_SECRET_PREVIOUS',
      format,
    ])
    expectRules(valid({ reviewIpHmacSecretPrevious: PREV, reviewIpHmacKeyIdPrevious: 'k1' }), [
      'REVIEW_IP_HMAC_KEY_ID_PREVIOUS must differ from REVIEW_IP_HMAC_KEY_ID',
    ])
    expectRules(valid({ reviewIpHmacSecretPrevious: PREV, reviewIpHmacKeyIdPrevious: ' k1 ' }), [
      'REVIEW_IP_HMAC_KEY_ID_PREVIOUS must differ from REVIEW_IP_HMAC_KEY_ID',
    ])
    expectRules(valid({ reviewIpHmacSecretPrevious: PREV, reviewIpHmacKeyIdPrevious: 'k0' }), [format])
    expectRules(valid({ reviewIpHmacSecretPrevious: PREV, reviewIpHmacKeyIdPrevious: 'k9999' }))
    expectRules(
      valid({
        vercelEnv: 'development',
        nodeEnv: 'development',
        reviewIpHmacSecret: undefined,
        reviewIpHmacKeyId: undefined,
        rateLimitHmacSecret: undefined,
        reviewIpHmacKeyIdPrevious: 'k2',
      }),
      ['REVIEW_IP_HMAC_KEY_ID_PREVIOUS requires REVIEW_IP_HMAC_SECRET_PREVIOUS'],
    )
  })

  it('refuses a review secret equal to the rate-limit secret or the previous secret', () => {
    expectRules(valid({ reviewIpHmacSecret: RATE, rateLimitHmacSecret: RATE }), [
      'REVIEW_IP_HMAC_SECRET must not equal RATE_LIMIT_HMAC_SECRET',
    ])
    expectRules(valid({ vercelEnv: 'preview', nodeEnv: 'development', userRatings: undefined, reviewIpHmacSecret: RATE, rateLimitHmacSecret: ` ${RATE} ` }), [
      'REVIEW_IP_HMAC_SECRET must not equal RATE_LIMIT_HMAC_SECRET',
    ])
    expectRules(valid({ reviewIpHmacSecretPrevious: IP, reviewIpHmacKeyIdPrevious: 'k2' }), [
      'REVIEW_IP_HMAC_SECRET must not equal REVIEW_IP_HMAC_SECRET_PREVIOUS',
    ])
    expectRules(valid({ reviewIpHmacSecret: RATE, rateLimitHmacSecret: RATE, reviewIpHmacSecretPrevious: RATE, reviewIpHmacKeyIdPrevious: 'k2' }), [
      'REVIEW_IP_HMAC_SECRET must not equal RATE_LIMIT_HMAC_SECRET',
      'REVIEW_IP_HMAC_SECRET must not equal REVIEW_IP_HMAC_SECRET_PREVIOUS',
    ])
    expectRules(valid({ reviewIpHmacSecret: SHORT, rateLimitHmacSecret: SHORT, reviewIpHmacKeyIdPrevious: 'k2', reviewIpHmacSecretPrevious: SHORT }), [
      'RATE_LIMIT_HMAC_SECRET must be at least 32 bytes',
      'REVIEW_IP_HMAC_SECRET must be at least 32 bytes',
      'REVIEW_IP_HMAC_SECRET_PREVIOUS must be at least 32 bytes',
      'REVIEW_IP_HMAC_SECRET must not equal RATE_LIMIT_HMAC_SECRET',
      'REVIEW_IP_HMAC_SECRET must not equal REVIEW_IP_HMAC_SECRET_PREVIOUS',
    ])
    expectRules(valid({ vercelEnv: 'preview', nodeEnv: 'development', rateLimitHmacSecret: 'tiny', reviewIpHmacSecret: IP }))
  })

  it('requires RATE_LIMIT_HMAC_SECRET to be at least 32 bytes in production and leaves preview alone', () => {
    expectRules(valid({ rateLimitHmacSecret: undefined }), ['RATE_LIMIT_HMAC_SECRET is required'])
    expectRules(valid({ rateLimitHmacSecret: '   ' }), ['RATE_LIMIT_HMAC_SECRET is required'])
    expectRules(valid({ rateLimitHmacSecret: SHORT }), ['RATE_LIMIT_HMAC_SECRET must be at least 32 bytes'])
    expectRules(valid({ rateLimitHmacSecret: '¤'.repeat(24) }))
    for (const vercelEnv of [undefined, '', 'preview', 'development', 'staging'] as const) {
      expectRules(
        valid({
          vercelEnv,
          nodeEnv: 'development',
          userRatings: undefined,
          rateLimitHmacSecret: undefined,
          reviewIpHmacSecret: undefined,
          reviewIpHmacKeyId: undefined,
        }),
      )
      expectRules(
        valid({
          vercelEnv,
          nodeEnv: 'production',
          userRatings: 'off',
          rateLimitHmacSecret: 'short-rate-limit',
          reviewIpHmacSecret: undefined,
          reviewIpHmacKeyId: undefined,
        }),
      )
    }
    expectRules(valid({ vercelEnv: 'preview', nodeEnv: 'development', userRatings: 'on', rateLimitHmacSecret: undefined }))
    expectRules(valid({ vercelEnv: 'preview', nodeEnv: 'development', userRatings: 'on', rateLimitHmacSecret: 'short-rate-limit' }))
  })

  it('fails BBF_E2E_HOOKS=1 with VERCEL=1 or production (spec T25)', () => {
    const hook = 'BBF_E2E_HOOKS must not be 1 when VERCEL is 1'
    const vercelEnv = 'BBF_E2E_HOOKS must not be 1 when VERCEL_ENV is production'
    const nodeEnv = 'BBF_E2E_HOOKS must not be 1 when NODE_ENV is production'
    expectRules(valid({ bbfE2eHooks: '1', vercel: '1', vercelEnv: 'preview', nodeEnv: 'development', rateLimitHmacSecret: undefined, reviewIpHmacSecret: undefined, reviewIpHmacKeyId: undefined }), [hook])
    expectRules(valid({ bbfE2eHooks: ' 1 ', vercel: ' 1 ', vercelEnv: 'preview', nodeEnv: 'test' }), [hook])
    expectRules(valid({ bbfE2eHooks: '1', vercel: undefined, vercelEnv: 'production', nodeEnv: 'test' }), [vercelEnv])
    expectRules(valid({ bbfE2eHooks: '1', vercel: undefined, vercelEnv: 'preview', nodeEnv: 'production', rateLimitHmacSecret: undefined, reviewIpHmacSecret: undefined, reviewIpHmacKeyId: undefined }), [nodeEnv])
    expectRules(valid({ bbfE2eHooks: '1', vercel: '1', vercelEnv: 'production', nodeEnv: 'production' }), [hook, vercelEnv, nodeEnv])
    expectRules(valid({ bbfE2eHooks: '1', vercel: undefined, vercelEnv: 'preview', nodeEnv: 'development', rateLimitHmacSecret: undefined, reviewIpHmacSecret: undefined, reviewIpHmacKeyId: undefined }))
    for (const bbfE2eHooks of [undefined, '', '0', 'true', 'yes']) {
      expectRules(valid({ bbfE2eHooks, vercel: '1', vercelEnv: 'production', nodeEnv: 'production' }))
    }
  })

  it('reports every broken rule together and still hides every secret substring', () => {
    expectRules(
      {
        vercelEnv: 'production',
        vercel: '1',
        nodeEnv: 'production',
        bbfE2eHooks: '1',
        userRatings: 'on',
        reviewIpHmacSecret: SHORT,
        reviewIpHmacKeyId: SHORT,
        rateLimitHmacSecret: SHORT,
        reviewIpHmacSecretPrevious: undefined,
        reviewIpHmacKeyIdPrevious: 'k1',
      },
      [
        'BBF_E2E_HOOKS must not be 1 when VERCEL is 1',
        'BBF_E2E_HOOKS must not be 1 when VERCEL_ENV is production',
        'BBF_E2E_HOOKS must not be 1 when NODE_ENV is production',
        'RATE_LIMIT_HMAC_SECRET must be at least 32 bytes',
        'REVIEW_IP_HMAC_SECRET must be at least 32 bytes',
        `REVIEW_IP_HMAC_KEY_ID must match ${REVIEW_KEY_ID_RULE}`,
        'REVIEW_IP_HMAC_KEY_ID_PREVIOUS requires REVIEW_IP_HMAC_SECRET_PREVIOUS',
        'REVIEW_IP_HMAC_SECRET must not equal RATE_LIMIT_HMAC_SECRET',
      ],
    )
  })

  it('reads process.env when called with no arguments and does not log', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    delete process.env.REVIEW_IP_HMAC_SECRET
    delete process.env.REVIEW_IP_HMAC_KEY_ID
    delete process.env.REVIEW_IP_HMAC_SECRET_PREVIOUS
    delete process.env.REVIEW_IP_HMAC_KEY_ID_PREVIOUS
    delete process.env.RATE_LIMIT_HMAC_SECRET
    delete process.env.BBF_E2E_HOOKS
    process.env.VERCEL_ENV = 'preview'
    process.env.USER_RATINGS = 'off'
    expect(() => assertReviewHmacSecrets()).not.toThrow()
    process.env.USER_RATINGS = 'on'
    try {
      assertReviewHmacSecrets()
      throw new Error('validator returned')
    } catch (caught) {
      expect(caught).toBeInstanceOf(Error)
      if (caught instanceof Error) {
        expect(caught.message).toBe('REVIEW_IP_HMAC_SECRET is required\nREVIEW_IP_HMAC_KEY_ID is required')
      }
    }
    process.env.REVIEW_IP_HMAC_SECRET = IP
    process.env.REVIEW_IP_HMAC_KEY_ID = 'k1'
    process.env.RATE_LIMIT_HMAC_SECRET = RATE
    process.env.VERCEL_ENV = 'production'
    expect(() => assertReviewHmacSecrets()).not.toThrow()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })

  it('compares SHA-256 digests with timingSafeEqual and has no fallback key', () => {
    const source = readFileSync(new URL('./review-hmac-secrets.ts', import.meta.url), 'utf8')
    expect(source).toContain("createHash('sha256').update(left).digest()")
    expect(source).toContain('timingSafeEqual(leftDigest, rightDigest)')
    expect(source).not.toContain('RATE_LIMIT_FALLBACK')
    expect(source).not.toContain('console.')
    const left = createHash('sha256').update(IP).digest()
    const right = createHash('sha256').update(RATE).digest()
    expect(timingSafeEqual(left, left)).toBe(true)
    expect(timingSafeEqual(left, right)).toBe(false)
    expect(source).not.toMatch(/review === rateLimit|previous === review|secret ===/)
  })

  it('is the validator imported by the build and by server boot', () => {
    const config = readFileSync(new URL('../../next.config.ts', import.meta.url), 'utf8')
    const boot = readFileSync(new URL('../instrumentation.ts', import.meta.url), 'utf8')
    expect(config).toContain("import { assertReviewHmacSecrets } from './src/lib/review-hmac-secrets'")
    expect(config).toContain('assertReviewHmacSecrets()')
    expect(boot).toContain("await import('./lib/review-hmac-secrets')")
    expect(boot).toContain('assertReviewHmacSecrets()')
    expect(boot).toContain("process.env.NEXT_RUNTIME === 'edge'")
  })
})

describe('K_ip and K_net', () => {
  it('derives HKDF-SHA256 subkeys with the review labels and no fallback', () => {
    const ip = K_ip(IP)
    const net = K_net(IP)
    expect(ip).toHaveLength(32)
    expect(net).toHaveLength(32)
    expect(ip.equals(net)).toBe(false)
    expect(ip.equals(Buffer.from(hkdfSync('sha256', IP, Buffer.alloc(0), REVIEW_IP_HKDF_LABEL, 32)))).toBe(true)
    expect(net.equals(Buffer.from(hkdfSync('sha256', IP, Buffer.alloc(0), REVIEW_NET_HKDF_LABEL, 32)))).toBe(true)
    expect(REVIEW_IP_HKDF_LABEL).toBe('bestbotfor/review-ip/v1')
    expect(REVIEW_NET_HKDF_LABEL).toBe('bestbotfor/review-net/v1')
    expect(K_ip(OTHER).equals(ip)).toBe(false)
    expect(ip.equals(Buffer.from(IP))).toBe(false)
    expect(ip.equals(createHash('sha256').update(IP).digest())).toBe(false)
    delete process.env.RATE_LIMIT_HMAC_SECRET
    process.env.RATE_LIMIT_HMAC_SECRET = RATE
    delete process.env.REVIEW_IP_HMAC_SECRET
    expect(() => K_ip()).toThrow('REVIEW_IP_HMAC_SECRET must be at least 32 bytes')
    try {
      K_net()
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      if (error instanceof Error) assertNoSecretSubstring(error.message, [RATE, SHORT, IP])
    }
    process.env.REVIEW_IP_HMAC_SECRET = ` ${IP} `
    expect(K_ip().equals(ip)).toBe(true)
    expect(K_net().equals(net)).toBe(true)
    try {
      K_ip(SHORT)
      throw new Error('short secret was accepted')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      if (error instanceof Error) {
        expect(error.message).toBe('REVIEW_IP_HMAC_SECRET must be at least 32 bytes')
        assertNoSecretSubstring(error.message, [SHORT, IP, RATE])
      }
    }
  })
})

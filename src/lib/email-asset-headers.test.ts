import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMAIL_ASSET_HEADERS, EMAIL_ASSET_SOURCE } from './email-asset-headers'
import { securityHeaders } from './csp'

type Rule = { source: string; headers: readonly { key: string; value: string }[] }

// Mirrors next.config headers(): catch-all security headers, then the /email override.
const rules: Rule[] = [
  { source: '/:path*', headers: [{ key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }] },
  { source: EMAIL_ASSET_SOURCE, headers: EMAIL_ASSET_HEADERS },
]

function toRegex(source: string) {
  return new RegExp('^' + source.replace(':path*', '.*') + '$')
}

function resolve(path: string) {
  const out: Record<string, string> = {}
  for (const rule of rules) {
    if (toRegex(rule.source).test(path)) for (const h of rule.headers) out[h.key] = h.value
  }
  return out
}

describe('email asset CORP', () => {
  it('serves /email/* cross-origin', () => {
    expect(resolve('/email/bestbotfor-logo.png')['Cross-Origin-Resource-Policy']).toBe('cross-origin')
  })
  it('keeps same-origin elsewhere', () => {
    expect(resolve('/')['Cross-Origin-Resource-Policy']).toBe('same-origin')
    expect(resolve('/logos/x.png')['Cross-Origin-Resource-Policy']).toBe('same-origin')
    expect(securityHeaders()['Cross-Origin-Resource-Policy']).toBe('same-origin')
  })
  it('next.config registers the override after the catch-all', () => {
    const cfg = readFileSync(join(__dirname, '../../next.config.ts'), 'utf8')
    const all = cfg.indexOf("{ source: '/:path*', headers: securityHeaders }")
    const email = cfg.indexOf('{ source: EMAIL_ASSET_SOURCE')
    expect(all).toBeGreaterThan(-1)
    expect(email).toBeGreaterThan(all)
    expect(cfg).toContain("{ key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }")
  })
})

import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy, securityHeaders } from './csp'

describe('content security policy', () => {
  it('uses the nonce for scripts and leaves styles without one', () => {
    const policy = buildContentSecurityPolicy('abc123', false)
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'")
    expect(policy).toContain("style-src 'self' 'unsafe-inline'")
    expect(policy).not.toContain("style-src 'self' 'nonce-")
    expect(policy).toContain("font-src 'self'")
    expect(policy).not.toContain('fonts.googleapis.com')
    expect(policy).not.toContain('fonts.gstatic.com')
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).not.toContain('unsafe-eval')
  })

  it('allows eval only in development', () => {
    expect(buildContentSecurityPolicy('abc123', true)).toContain("'unsafe-eval'")
  })

  it('sends the other security headers', () => {
    const headers = securityHeaders()
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })

  it('allows the Clerk production custom domains and keeps *.clerk.com', () => {
    const policy = buildContentSecurityPolicy('n', false)
    const directive = (name: string) => {
      const found = policy.split('; ').find((d) => d.startsWith(`${name} `))
      expect(found, name).toBeDefined()
      return found!.split(' ').slice(1)
    }
    for (const name of ['script-src', 'connect-src', 'img-src', 'frame-src']) {
      expect(directive(name)).toContain('https://clerk.bestbotfor.com')
    }
    expect(directive('frame-src')).toContain('https://accounts.bestbotfor.com')
    expect(directive('form-action')).toEqual(["'self'", 'https://accounts.bestbotfor.com'])
    expect(directive('script-src')).toContain('https://*.clerk.com')
    expect(directive('connect-src')).toContain('https://*.clerk.com')
    expect(directive('worker-src')).toEqual(["'self'", 'blob:'])
    expect(directive('script-src')).not.toContain("'unsafe-inline'")
    expect(policy).not.toMatch(/https:\/\/\*\.bestbotfor\.com/)
    expect(directive('default-src')).toEqual(["'self'"])
  })
})

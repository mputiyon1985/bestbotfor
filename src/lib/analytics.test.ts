import { afterEach, describe, expect, it, vi } from 'vitest'
import { track } from './analytics'

afterEach(() => {
  vi.unstubAllGlobals()
})

function installBrowser(cookie: string, gtag?: (...args: unknown[]) => void) {
  const calls: unknown[][] = []
  const impl =
    gtag ??
    ((...args: unknown[]) => {
      calls.push(args)
    })
  vi.stubGlobal('window', { gtag: impl })
  vi.stubGlobal('document', { cookie })
  return calls
}

describe('track', () => {
  it('does not send newsletter_signup or sign_up before consent', () => {
    const calls = installBrowser('other=1')
    expect(track('newsletter_signup')).toBe(false)
    expect(track('sign_up', { method: 'clerk' })).toBe(false)
    expect(calls).toEqual([])
  })

  it('does not send when consent was rejected, even if gtag exists', () => {
    const calls = installBrowser('bbf_consent=denied')
    expect(track('newsletter_signup')).toBe(false)
    expect(track('sign_up', { method: 'clerk' })).toBe(false)
    expect(calls).toEqual([])
  })

  it('does not send a granted choice when gtag is missing', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', { cookie: 'bbf_consent=granted' })
    expect(track('newsletter_signup')).toBe(false)
    expect(track('sign_up')).toBe(false)
  })

  it('sends newsletter_signup and sign_up after consent and drops an email param', () => {
    const calls = installBrowser('session=1; bbf_consent=granted')
    expect(track('newsletter_signup', { email: 'reader@example.com' })).toBe(true)
    expect(track('sign_up', { method: 'clerk', email: 'reader@example.com' })).toBe(true)
    expect(calls).toEqual([
      ['event', 'newsletter_signup', {}],
      ['event', 'sign_up', { method: 'clerk' }],
    ])
    expect(JSON.stringify(calls)).not.toContain('reader@example.com')
  })
})

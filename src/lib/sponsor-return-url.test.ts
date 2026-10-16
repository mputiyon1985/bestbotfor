import { describe, expect, it } from 'vitest'
import {
  requestHostFromHeaders,
  requestOriginFromHeaders,
  sponsorReturnOrigin,
  sponsorReturnUrls,
  SPONSOR_PRODUCTION_ORIGIN,
} from './sponsor-return-url'

const PREVIEW = 'bestbotfor-git-cursor-sponsor-2809b2-markputiyon-2225s-projects.vercel.app'
const DEPLOYMENT = 'bestbotfor-abc123-markputiyon-2225s-projects.vercel.app'

function headers(values: Record<string, string>): { get(name: string): string | null } {
  return {
    get(name: string) {
      return values[name] ?? null
    },
  }
}

describe('sponsorReturnOrigin', () => {
  it('keeps production on the apex even when the request is another host', () => {
    expect(
      sponsorReturnOrigin({
        requestOrigin: `https://${PREVIEW}`,
        env: { VERCEL_ENV: 'production', VERCEL_URL: PREVIEW, VERCEL_BRANCH_URL: PREVIEW },
      }),
    ).toBe(SPONSOR_PRODUCTION_ORIGIN)
    expect(
      sponsorReturnOrigin({
        requestOrigin: 'https://www.bestbotfor.com',
        env: { VERCEL_ENV: 'production' },
      }),
    ).toBe('https://bestbotfor.com')
    expect(
      sponsorReturnOrigin({
        requestOrigin: 'http://127.0.0.1:3000',
        requestHost: '127.0.0.1:3000',
        env: { VERCEL_ENV: ' production ' },
      }),
    ).toBe('https://bestbotfor.com')
  })

  it('uses the request origin on preview when that host is this deployment', () => {
    expect(
      sponsorReturnOrigin({
        requestOrigin: `https://${PREVIEW}`,
        env: { VERCEL_ENV: 'preview', VERCEL_URL: DEPLOYMENT, VERCEL_BRANCH_URL: PREVIEW },
      }),
    ).toBe(`https://${PREVIEW}`)
  })

  it('falls back to the branch URL, then the deployment URL', () => {
    expect(
      sponsorReturnOrigin({
        requestOrigin: 'https://evil.example',
        env: { VERCEL_ENV: 'preview', VERCEL_URL: DEPLOYMENT, VERCEL_BRANCH_URL: PREVIEW },
      }),
    ).toBe(`https://${PREVIEW}`)

    expect(
      sponsorReturnOrigin({
        requestOrigin: null,
        env: { VERCEL_ENV: 'preview', VERCEL_URL: DEPLOYMENT },
      }),
    ).toBe(`https://${DEPLOYMENT}`)
  })

  it('prefers the preview deployment over an apex or www Origin', () => {
    expect(
      sponsorReturnOrigin({
        requestOrigin: 'https://www.bestbotfor.com',
        env: { VERCEL_ENV: ' preview ', NEXT_PUBLIC_SITE_URL: 'https://evil.example', VERCEL_URL: DEPLOYMENT },
      }),
    ).toBe(`https://${DEPLOYMENT}`)
    expect(
      sponsorReturnOrigin({
        requestOrigin: 'https://bestbotfor.com',
        env: { VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: PREVIEW, VERCEL_URL: DEPLOYMENT },
      }),
    ).toBe(`https://${PREVIEW}`)

    expect(
      sponsorReturnOrigin({
        requestOrigin: 'https://evil.example',
        env: { VERCEL_ENV: 'preview', NEXT_PUBLIC_SITE_URL: 'https://evil.example' },
      }),
    ).toBe('https://bestbotfor.com')
  })

  it('allows loopback http only when the request host is loopback and this is not production', () => {
    expect(sponsorReturnOrigin({ requestOrigin: 'http://127.0.0.1:3000', env: {} })).toBe('http://127.0.0.1:3000')
    expect(
      sponsorReturnOrigin({ requestOrigin: 'http://localhost:3000', env: { VERCEL_ENV: 'development' } }),
    ).toBe('http://localhost:3000')
    expect(
      sponsorReturnOrigin({
        requestOrigin: 'http://127.0.0.1:3000',
        requestHost: '127.0.0.1:3000',
        env: { VERCEL_ENV: 'preview' },
      }),
    ).toBe('http://127.0.0.1:3000')
    expect(
      sponsorReturnOrigin({
        requestOrigin: 'https://bestbotfor.com',
        requestHost: '127.0.0.1:3000',
        env: { VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'http://127.0.0.1:3000' },
      }),
    ).toBe('http://127.0.0.1:3000')
    expect(
      sponsorReturnOrigin({
        requestOrigin: 'http://127.0.0.1:3000',
        requestHost: PREVIEW,
        env: { VERCEL_ENV: 'preview' },
      }),
    ).toBe('https://bestbotfor.com')
    expect(
      sponsorReturnOrigin({
        requestOrigin: 'http://127.0.0.1:3000',
        requestHost: '127.0.0.1:3000',
        env: { VERCEL_ENV: 'preview', VERCEL_URL: DEPLOYMENT },
      }),
    ).toBe(`https://${DEPLOYMENT}`)
    expect(
      sponsorReturnOrigin({ requestOrigin: 'http://127.0.0.1:3000', env: { VERCEL_ENV: 'production' } }),
    ).toBe('https://bestbotfor.com')
  })

  it('rejects open redirects and other projects', () => {
    const env = { VERCEL_ENV: 'preview', VERCEL_URL: DEPLOYMENT, VERCEL_BRANCH_URL: PREVIEW }
    const rejected = [
      'https://evil.example',
      'https://bestbotfor.com.evil.com',
      'https://evil.bestbotfor.com',
      'https://notbestbotfor.vercel.app',
      'https://other-project.vercel.app',
      `https://bestbotfor-other.vercel.app`,
      'https://bestbotfor.vercel.app.evil.com',
      'https://user:pass@bestbotfor.com',
      'https://bestbotfor.com@evil.com',
      'https://evil.com@bestbotfor.com',
      'http://bestbotfor.com',
      'https://bestbotfor.com:444',
      'https://bestbotfor.com/sponsor',
      'https://bestbotfor.com/?next=https://evil.example',
      'https://bestbotfor.com#@evil.com',
      'https://bestbotfor.com,evil.com',
      'https://127.0.0.1',
      'http://127.0.0.1.evil.com',
      `http://${PREVIEW}`,
    ]
    for (const requestOrigin of rejected) {
      expect(sponsorReturnOrigin({ requestOrigin, env }), requestOrigin).toBe(`https://${PREVIEW}`)
    }
  })

  it('does not encode the Checkout session placeholder', () => {
    const urls = sponsorReturnUrls('https://bestbotfor.com')
    expect(urls.successUrl).toBe('https://bestbotfor.com/sponsor/success?session_id={CHECKOUT_SESSION_ID}')
    expect(urls.cancelUrl).toBe('https://bestbotfor.com/sponsor/cancel')
    expect(urls.successUrl).not.toContain('%7B')
    expect(sponsorReturnUrls(`https://${PREVIEW}`).successUrl).toBe(
      `https://${PREVIEW}/sponsor/success?session_id={CHECKOUT_SESSION_ID}`,
    )
  })
})

describe('requestOriginFromHeaders', () => {
  it('prefers a single origin header', () => {
    expect(
      requestOriginFromHeaders(
        headers({
          origin: 'https://www.bestbotfor.com',
          'x-forwarded-host': 'evil.example',
          host: 'evil.example',
        }),
      ),
    ).toBe('https://www.bestbotfor.com')
  })

  it('rejects comma-separated hosts and falls through', () => {
    expect(
      requestOriginFromHeaders(
        headers({
          origin: 'https://bestbotfor.com, https://evil.example',
          'x-forwarded-host': 'bestbotfor.com, evil.example',
          host: '127.0.0.1:3000',
        }),
      ),
    ).toBe('http://127.0.0.1:3000')
  })

  it('builds https from a public host', () => {
    expect(requestOriginFromHeaders(headers({ 'x-forwarded-host': PREVIEW, 'x-forwarded-proto': 'https' }))).toBe(
      `https://${PREVIEW}`,
    )
  })

  it('reads the request host from the forwarded host, not Origin', () => {
    expect(
      requestHostFromHeaders(
        headers({
          origin: 'http://127.0.0.1:3000',
          'x-forwarded-host': PREVIEW,
          host: '127.0.0.1:3000',
        }),
      ),
    ).toBe(PREVIEW)
  })
})

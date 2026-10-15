import { afterEach, describe, expect, it } from 'vitest'
import { websiteJsonLd } from './jsonld'
import { DEFAULT_SITE_URL, getSiteUrl } from './site'

const original = process.env.NEXT_PUBLIC_SITE_URL

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
  else process.env.NEXT_PUBLIC_SITE_URL = original
})

describe('getSiteUrl', () => {
  it('defaults to the apex domain', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    expect(getSiteUrl()).toBe(DEFAULT_SITE_URL)
    expect(getSiteUrl()).toBe('https://bestbotfor.com')
  })

  it('uses a valid https origin from the environment', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://bestbotfor.com/ignored'
    expect(getSiteUrl()).toBe('https://bestbotfor.com')
    expect(websiteJsonLd().url).toBe('https://bestbotfor.com')
  })

  it('rejects a non-local http origin', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://example.com'
    expect(getSiteUrl()).toBe('https://bestbotfor.com')
  })

  it('allows localhost for development', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3000'
    expect(getSiteUrl()).toBe('http://127.0.0.1:3000')
  })
})

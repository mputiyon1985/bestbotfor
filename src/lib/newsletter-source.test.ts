import { describe, expect, it } from 'vitest'
import { newsletterReferringPath, parseNewsletterSource } from './newsletter-source'

describe('newsletter source', () => {
  it('keeps the five placement names and rejects anything else', () => {
    expect(parseNewsletterSource('home')).toBe('home')
    expect(parseNewsletterSource('result')).toBe('result')
    expect(parseNewsletterSource('best')).toBe('best')
    expect(parseNewsletterSource('compare')).toBe('compare')
    expect(parseNewsletterSource('newsletter')).toBe('newsletter')
    expect(parseNewsletterSource('https://evil.example')).toBe('newsletter')
    expect(parseNewsletterSource('reader@example.com')).toBe('newsletter')
  })

  it('maps each placement to a fixed path', () => {
    expect(newsletterReferringPath('home')).toBe('/')
    expect(newsletterReferringPath('result')).toBe('/result')
    expect(newsletterReferringPath('best')).toBe('/best')
    expect(newsletterReferringPath('compare')).toBe('/compare')
    expect(newsletterReferringPath('newsletter')).toBe('/newsletter')
  })
})

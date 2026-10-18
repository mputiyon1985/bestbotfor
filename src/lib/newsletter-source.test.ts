import { describe, expect, it } from 'vitest'
import { alternativesNewsletterSource, newsletterReferringPath, parseNewsletterSource } from './newsletter-source'

describe('newsletter source', () => {
  it('keeps the placement names and rejects anything else', () => {
    expect(parseNewsletterSource('home')).toBe('home')
    expect(parseNewsletterSource('result')).toBe('result')
    expect(parseNewsletterSource('best')).toBe('best')
    expect(parseNewsletterSource('compare')).toBe('compare')
    expect(parseNewsletterSource('newsletter')).toBe('newsletter')
    expect(parseNewsletterSource('ai-loadout')).toBe('ai-loadout')
    expect(parseNewsletterSource('guides')).toBe('guides')
    expect(parseNewsletterSource('alternatives-chatgpt')).toBe('alternatives-chatgpt')
    expect(parseNewsletterSource('alternatives-notion-ai')).toBe('newsletter')
    expect(parseNewsletterSource('alternatives')).toBe('newsletter')
    expect(parseNewsletterSource('https://evil.example')).toBe('newsletter')
    expect(parseNewsletterSource('reader@example.com')).toBe('newsletter')
  })

  it('maps each placement to a fixed path', () => {
    expect(newsletterReferringPath('home')).toBe('/')
    expect(newsletterReferringPath('result')).toBe('/result')
    expect(newsletterReferringPath('best')).toBe('/best')
    expect(newsletterReferringPath('compare')).toBe('/compare')
    expect(newsletterReferringPath('newsletter')).toBe('/newsletter')
    expect(newsletterReferringPath('ai-loadout')).toBe('/ai-loadout')
    expect(newsletterReferringPath('guides')).toBe('/guides/how-to-choose-an-ai-tool')
    for (const tool of ['chatgpt', 'midjourney', 'zapier', 'cursor', 'elevenlabs']) {
      const source = alternativesNewsletterSource(tool)
      expect(source).toBe(`alternatives-${tool}`)
      expect(newsletterReferringPath(source!)).toBe(`/alternatives/${tool}`)
    }
    expect(alternativesNewsletterSource('notion-ai')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { outboundPageType, withOutboundUtm } from './outbound-utm'

describe('outbound UTMs', () => {
  it('maps paths to page types without echoing the path', () => {
    expect(outboundPageType('/')).toBe('home')
    expect(outboundPageType('direct')).toBe('direct')
    expect(outboundPageType('/tools/cursor')).toBe('tool')
    expect(outboundPageType('/compare/chatgpt-vs-claude')).toBe('compare')
    expect(outboundPageType('/alternatives/jasper')).toBe('alternatives')
    expect(outboundPageType('/guides/x')).toBe('guide')
    expect(outboundPageType('/<script>')).toBe('other')
  })

  it('adds ours when the URL has no utm_*', () => {
    const url = new URL(withOutboundUtm('https://cursor.com/?ref=abc', 'tool'))
    expect(url.searchParams.get('ref')).toBe('abc')
    expect(url.searchParams.get('utm_source')).toBe('bestbotfor')
    expect(url.searchParams.get('utm_medium')).toBe('referral')
    expect(url.searchParams.get('utm_campaign')).toBe('tool')
  })

  it('never overwrites or mixes with existing UTMs', () => {
    const affiliate = 'https://partner.example/?utm_source=impact&utm_medium=affiliate'
    expect(withOutboundUtm(affiliate, 'tool')).toBe(affiliate)
    const upper = 'https://partner.example/?UTM_Campaign=x'
    expect(withOutboundUtm(upper, 'tool')).toBe(upper)
  })

  it('keeps the host', () => {
    expect(new URL(withOutboundUtm('https://www.synthesia.io/a', 'best')).host).toBe('www.synthesia.io')
  })
})

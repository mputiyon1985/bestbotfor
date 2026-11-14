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
    const hyphen = 'https://docsalot.dev/?utm-source=bestbotfor'
    expect(withOutboundUtm(hyphen, 'direct')).toBe(hyphen)
    const cello = 'https://sendr.cello.so/LOp5fYtd9Jc'
    expect(withOutboundUtm(cello, 'direct')).toBe(cello)
    expect(withOutboundUtm(cello, 'tool')).toBe(cello)
    expect(withOutboundUtm(`${cello}?utm_source=x&foo=1`, 'direct')).toBe(cello)
    const julius = 'https://julius.dub.link/mark-putiyon'
    expect(withOutboundUtm(julius, 'direct')).toBe(julius)
    expect(withOutboundUtm(julius, 'tool')).toBe(julius)
    expect(withOutboundUtm(`${julius}?utm_source=x&foo=1`, 'direct')).toBe(julius)
    const context = 'https://link.context.dev/mark-putiyon'
    expect(withOutboundUtm(context, 'direct')).toBe(context)
    expect(withOutboundUtm(context, 'tool')).toBe(context)
    expect(withOutboundUtm(`${context}?utm_source=x&foo=1`, 'direct')).toBe(context)
    const startup = 'https://buy.stripe.com/dRmbJ197SdjH3jRa8f2Ji08'
    const team = 'https://buy.stripe.com/eVqbJ1bg02F3f2z4NV2Ji07'
    expect(withOutboundUtm(startup, 'direct')).toBe(startup)
    expect(withOutboundUtm(`${startup}?utm_source=x&foo=1`, 'tool')).toBe(startup)
    expect(withOutboundUtm(team, 'direct')).toBe(team)
    expect(withOutboundUtm(`${team}?utm_source=x`, 'direct')).toBe(team)
    const videco = 'https://videco.io?via=mark276'
    expect(withOutboundUtm(videco, 'direct')).toBe(videco)
    expect(withOutboundUtm(videco, 'tool')).toBe(videco)
    expect(withOutboundUtm('https://videco.io/?via=mark276', 'direct')).toBe(videco)
    expect(withOutboundUtm('https://videco.io/', 'direct')).toContain('utm_source=bestbotfor')
  })

  it('keeps the host', () => {
    expect(new URL(withOutboundUtm('https://www.synthesia.io/a', 'best')).host).toBe('www.synthesia.io')
  })
})

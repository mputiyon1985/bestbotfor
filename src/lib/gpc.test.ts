import { describe, expect, it } from 'vitest'
import { allowVercelAnalyticsEvent, analyticsStorageAllowed, consentDecision, gpcOptOut, navigatorGpcOptOut, secGpcOptOut } from './gpc'

describe('Global Privacy Control', () => {
  it('treats only Sec-GPC 1 and a true navigator flag as an opt-out', () => {
    expect(secGpcOptOut('1')).toBe(true)
    expect(secGpcOptOut('0')).toBe(false)
    expect(secGpcOptOut('true')).toBe(false)
    expect(secGpcOptOut(null)).toBe(false)
    expect(secGpcOptOut(undefined)).toBe(false)
    expect(navigatorGpcOptOut(true)).toBe(true)
    expect(navigatorGpcOptOut(false)).toBe(false)
    expect(navigatorGpcOptOut('true')).toBe(false)
    expect(navigatorGpcOptOut(undefined)).toBe(false)
    expect(gpcOptOut({ secGpcHeader: '1', navigatorGpc: false })).toBe(true)
    expect(gpcOptOut({ secGpcHeader: null, navigatorGpc: true })).toBe(true)
    expect(gpcOptOut({ secGpcHeader: '0', navigatorGpc: false })).toBe(false)
  })

  it('does not grant analytics storage when GPC is on, even if the cookie says granted', () => {
    expect(analyticsStorageAllowed({ choice: 'granted', gpc: true })).toBe(false)
    expect(analyticsStorageAllowed({ choice: 'granted', gpc: false })).toBe(true)
    expect(analyticsStorageAllowed({ choice: 'denied', gpc: false })).toBe(false)
    expect(analyticsStorageAllowed({ choice: null, gpc: false })).toBe(false)
  })

  it('keeps analytics off and records denied when the banner sees GPC', () => {
    expect(consentDecision({ choice: null, gpc: true, gaId: 'G-TEST', adminPath: false })).toEqual({
      visible: true,
      track: false,
      writeDenied: true,
    })
    expect(consentDecision({ choice: 'granted', gpc: true, gaId: 'G-TEST', adminPath: false })).toEqual({
      visible: false,
      track: false,
      writeDenied: true,
    })
    expect(consentDecision({ choice: 'denied', gpc: true, gaId: 'G-TEST', adminPath: false })).toEqual({
      visible: false,
      track: false,
      writeDenied: false,
    })
  })

  it('loads analytics only after an explicit grant when GPC is off', () => {
    expect(consentDecision({ choice: 'granted', gpc: false, gaId: 'G-TEST', adminPath: false })).toEqual({
      visible: false,
      track: true,
      writeDenied: false,
    })
    expect(consentDecision({ choice: 'granted', gpc: false, gaId: 'G-TEST', adminPath: true })).toEqual({
      visible: false,
      track: false,
      writeDenied: false,
    })
    expect(consentDecision({ choice: 'granted', gpc: false, gaId: null, adminPath: false }).track).toBe(false)
    expect(consentDecision({ choice: null, gpc: false, gaId: 'G-TEST', adminPath: false })).toEqual({
      visible: true,
      track: false,
      writeDenied: false,
    })
  })

  it('drops a Vercel Analytics event when GPC is on', () => {
    const event = { type: 'pageview', url: 'https://bestbotfor.com/' }
    expect(allowVercelAnalyticsEvent(event, true)).toBeNull()
    expect(allowVercelAnalyticsEvent(event, false)).toEqual(event)
  })
})

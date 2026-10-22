/**
 * Global Privacy Control. A Sec-GPC header of "1", or
 * navigator.globalPrivacyControl === true, is an opt-out of analytics.
 * Any other header value is not a signal.
 */

export function secGpcOptOut(header: string | null | undefined): boolean {
  return header === '1'
}

export function navigatorGpcOptOut(value: unknown): boolean {
  return value === true
}

export function readNavigatorGpc(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigatorGpcOptOut((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl)
}

/** Drop a Vercel Analytics event when Global Privacy Control is on. */
export function allowVercelAnalyticsEvent<T>(event: T, gpc: boolean): T | null {
  if (gpc || readNavigatorGpc()) return null
  return event
}

export function gpcOptOut(input: { secGpcHeader: string | null | undefined; navigatorGpc: unknown }): boolean {
  return secGpcOptOut(input.secGpcHeader) || navigatorGpcOptOut(input.navigatorGpc)
}

export function analyticsStorageAllowed(input: { choice: 'granted' | 'denied' | null; gpc: boolean }): boolean {
  if (input.gpc) return false
  return input.choice === 'granted'
}

/**
 * What the banner does on load. Opening cookie settings can still show the
 * region after this returns visible: false.
 */
export function consentDecision(input: {
  choice: 'granted' | 'denied' | null
  gpc: boolean
  gaId: string | null
  adminPath: boolean
}): { visible: boolean; track: boolean; writeDenied: boolean } {
  if (input.gpc) {
    return {
      visible: input.choice === null,
      track: false,
      writeDenied: input.choice !== 'denied',
    }
  }
  return {
    visible: input.choice === null,
    track: input.choice === 'granted' && input.gaId !== null && !input.adminPath,
    writeDenied: false,
  }
}

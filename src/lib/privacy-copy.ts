import { OG_RATE_WINDOW_MS } from './og'
import {
  CHECKOUT_RATE_WINDOW_MS,
  GO_RATE_WINDOW_MS,
  NEWSLETTER_RATE_WINDOW_MS,
  PORTAL_RATE_WINDOW_MS,
  RESULT_RATE_WINDOW_MS,
  RESULT_WINDOW_PURGE_INTERVAL_MS,
} from './rate-windows'

/** Plain-language length of a millisecond window the limiter actually uses. */
export function windowPhrase(ms: number): string {
  if (ms > 0 && ms % (60 * 60_000) === 0) {
    const hours = ms / (60 * 60_000)
    return hours === 1 ? 'one hour' : `${hours} hours`
  }
  if (ms > 0 && ms % 60_000 === 0) {
    const minutes = ms / 60_000
    return minutes === 1 ? 'one minute' : `${minutes} minutes`
  }
  return `${ms} milliseconds`
}

export const GPC_PRIVACY_PARAGRAPH =
  'If your browser sends Global Privacy Control, we treat that as an opt-out of analytics. We honor a Sec-GPC request header whose value is 1, and we honor navigator.globalPrivacyControl when it is true. While either signal is present, we do not load Google Analytics, we do not grant analytics storage, and we store the bbf_consent cookie as denied. A saved value of granted does not override the signal. When the Sec-GPC header is 1, we do not load Vercel Analytics. When only navigator.globalPrivacyControl is true, we do not send Vercel Analytics events.'

/**
 * Facts from the rate-limit code. Windows come from the constants the
 * limiters use. rate_limits rows are not deleted. result_rate_windows rows
 * are deleted after they expire, when a later request runs cleanup.
 */
export function rateLimitPrivacyParagraphs(): string[] {
  const newsletter = windowPhrase(NEWSLETTER_RATE_WINDOW_MS)
  const visit = windowPhrase(GO_RATE_WINDOW_MS)
  const card = windowPhrase(OG_RATE_WINDOW_MS)
  const result = windowPhrase(RESULT_RATE_WINDOW_MS)
  const account = windowPhrase(CHECKOUT_RATE_WINDOW_MS)
  const cleanup = windowPhrase(RESULT_WINDOW_PURGE_INTERVAL_MS)
  return [
    'Rate limits do not store your IP address. When a limit uses the address, we store an HMAC-SHA256 of a fixed label, the limit name, and the address. If we have no address, that HMAC uses the word unknown instead of an address.',
    `Newsletter signup stores that HMAC with a count and a window end time. The window is ${newsletter}. Visit redirects use a ${visit} window. Social-card images use a ${card} window. We do not delete those rows when the window ends. The next request for the same HMAC resets the count. A row that is never requested again stays in the database.`,
    `The quiz result limit counts for ${result}. That row stores a SHA-256 of a fixed label, the HMAC above, and the window start. It does not store the IP address. We delete the row after the window ends, when a later request runs cleanup. That cleanup runs at most once a ${cleanup === 'one minute' ? 'minute' : cleanup} in each server process. If cleanup does not run, the expired row remains. The server process may also keep that HMAC in memory until the process stops.`,
    `Checkout and the billing portal do not use an IP hash. They store an HMAC of the account id. The checkout window is ${account}. The billing portal window is ${windowPhrase(PORTAL_RATE_WINDOW_MS)}. We do not delete those rows when the window ends.`,
  ]
}

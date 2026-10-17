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

export const CLICK_LOG_PARAGRAPH =
  'When you use a “Visit” button, we log the tool, the time, the page path on our site if the referrer is ours, and a country code when the host provides one. When we have a network address, we store a code made from that address and a secret key. That code is still pseudonymous personal data. If we have no address, we do not store a code. We keep the click log with no fixed deletion date today.'

export const GPC_PRIVACY_PARAGRAPH =
  'If your browser sends Global Privacy Control, we treat that as an opt-out of analytics. We honor the Global Privacy Control header when its value is 1, and we honor it when the browser says Global Privacy Control is on. While either signal is present, we do not load Google Analytics, we do not grant analytics storage, and we store the bbf_consent cookie as denied. A saved value of granted does not override the signal. When the Global Privacy Control header is 1, we do not load Vercel Analytics. When the browser says Global Privacy Control is on and that header is absent, we do not send Vercel Analytics events.'

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
    'When a rate limit uses the network address, we store a code made from a fixed label, the limit name, the address, and a secret key. That code is still pseudonymous personal data. If we have no address, the code uses the word unknown instead of an address.',
    `Newsletter signup stores that code with a count and a window end time. The window is ${newsletter}. Visit redirects use a ${visit} window. Social-card images use a ${card} window. We do not delete those rows when the window ends. After the window ends, the next request for the same code resets the count. A row that is never requested again stays in the database.`,
    `The quiz result limit counts for ${result}. That row stores a code made from a fixed label, the address code above, and the window start. The address code is still pseudonymous personal data. We delete the row after the window ends, when a later request runs cleanup. That cleanup runs at most once a ${cleanup === 'one minute' ? 'minute' : cleanup} in each server process. If cleanup does not run, the expired row remains. The server process may also keep the address code in memory until the process stops.`,
    `Checkout and the billing portal do not use a network address. They store a code made from the account id and a secret key. The checkout window is ${account}. The billing portal window is ${windowPhrase(PORTAL_RATE_WINDOW_MS)}. We do not delete those rows when the window ends.`,
  ]
}

export const SHARING_PARAGRAPH =
  'We use Clerk for accounts, Stripe for payments, Beehiiv for the digest when it is connected, Google Analytics for site measurement when it is configured and analytics is allowed, Vercel to host the site and for cookieless analytics, and Turso to store the database. We do not sell personal information.'

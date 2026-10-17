import { OG_RATE_WINDOW_MS } from './og'
import {
  CHECKOUT_RATE_WINDOW_MS,
  GO_RATE_WINDOW_MS,
  NEWSLETTER_RATE_WINDOW_MS,
  PORTAL_RATE_WINDOW_MS,
  RESULT_RATE_WINDOW_MS,
  RESULT_WINDOW_PURGE_INTERVAL_MS,
} from './rate-windows'
import { DATA_RETENTION_PRODUCTION_LAUNCH } from './retention-flags'

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

const BACKLOG_CAVEAT =
  'If more rows are waiting than one daily run can delete, they wait for a later run, so deletion can take longer than 48 hours.'

const CLICK_LOG_BASE =
  'When you use a “Visit” button, we log the tool, the time, the page path on our site if the referrer is ours, and a country code when the host provides one. When we have a network address, we store a code made from that address and a secret key. That code is still pseudonymous personal data. If we have no address, we do not store a code. We keep the click row, with no fixed date for deleting that row.'

export type RetentionCopyInput =
  | boolean
  | {
      launch?: boolean
      purge?: string
      dryRun?: string
    }

/**
 * The public page says the job is on only when production can write:
 * the launch constant is true, DATA_RETENTION_PURGE is exactly "on",
 * and DATA_RETENTION_DRY_RUN is exactly "off". A boolean argument is the
 * whole answer, for tests. The launch pull request sets all three.
 * It does not edit these sentences one by one.
 */
export function retentionCopyOn(input: RetentionCopyInput = {}): boolean {
  if (typeof input === 'boolean') return input
  const launch = input.launch ?? DATA_RETENTION_PRODUCTION_LAUNCH
  const purge = input.purge ?? process.env.DATA_RETENTION_PURGE
  const dryRun = input.dryRun ?? process.env.DATA_RETENTION_DRY_RUN
  return launch && purge?.trim() === 'on' && dryRun?.trim() === 'off'
}

export function clickLogParagraph(input: RetentionCopyInput = {}): string {
  const launch = retentionCopyOn(input)
  if (launch) {
    return `${CLICK_LOG_BASE} The retention job removes that address code after about 90 days. The click row stays.`
  }
  return `${CLICK_LOG_BASE} While the retention job is off, the address code also has no fixed deletion date. The retention job is off in production now.`
}

export function retentionJobParagraph(input: RetentionCopyInput = {}): string {
  const launch = retentionCopyOn(input)
  const schedule = `it runs about once a day. It deletes a rate-limit row or a quiz-result row that is still there 24 hours after the window ends, so that deletion lands about 24 to 48 hours after the window ends. ${BACKLOG_CAVEAT} It removes the click address code after about 90 days and leaves the rest of the click row.`
  const sooner =
    'A quiz-result row can still be deleted sooner, when a later request runs cleanup after the window ends. That cleanup does not wait for this job.'
  const onSchedule = schedule.replace(/^./, (letter) => letter.toUpperCase())
  if (launch) return `The retention job is on in production. ${onSchedule} ${sooner}`
  return `These deletions take effect only when the retention job is switched on. The retention job is off in production now. When it is switched on, ${schedule} Until the job is switched on, those deletions do not run. ${sooner}`
}

export function rateLimitRetentionKept(input: RetentionCopyInput = {}): string {
  const launch = retentionCopyOn(input)
  if (launch) {
    return `Deleted about 24 to 48 hours after the window ends. ${BACKLOG_CAVEAT}`
  }
  return `While the retention job is off, not deleted when the window ends. When that job is switched on, deleted about 24 to 48 hours after the window ends. The retention job is off in production now. ${BACKLOG_CAVEAT}`
}

export const CLICK_LOG_PARAGRAPH = clickLogParagraph()
export const RETENTION_JOB_PARAGRAPH = retentionJobParagraph()

export const GPC_PRIVACY_PARAGRAPH =
  'If your browser sends Global Privacy Control, we treat that as an opt-out of analytics. We honor the Global Privacy Control header when its value is 1, and we honor it when the browser says Global Privacy Control is on. While either signal is present, we do not load Google Analytics, we do not grant analytics storage, and we store the bbf_consent cookie as denied. A saved value of granted does not override the signal. When the Global Privacy Control header is 1, we do not load Vercel Analytics. When the browser says Global Privacy Control is on and that header is absent, we do not send Vercel Analytics events.'

/**
 * Facts from the rate-limit code. Windows come from the constants the
 * limiters use. rate_limits rows are not deleted. result_rate_windows rows
 * are deleted after they expire, when a later request runs cleanup.
 */
export function rateLimitPrivacyParagraphs(input: RetentionCopyInput = {}): string[] {
  const launch = retentionCopyOn(input)
  const newsletter = windowPhrase(NEWSLETTER_RATE_WINDOW_MS)
  const visit = windowPhrase(GO_RATE_WINDOW_MS)
  const card = windowPhrase(OG_RATE_WINDOW_MS)
  const result = windowPhrase(RESULT_RATE_WINDOW_MS)
  const account = windowPhrase(CHECKOUT_RATE_WINDOW_MS)
  const cleanup = windowPhrase(RESULT_WINDOW_PURGE_INTERVAL_MS)
  return [
    'When a rate limit uses the network address, we store a code made from a fixed label, the limit name, the address, and a secret key. That code is still pseudonymous personal data. If we have no address, the code uses the word unknown instead of an address.',
    `Newsletter signup stores that code with a count and a window end time. The window is ${newsletter}. Visit redirects use a ${visit} window. Social-card images use a ${card} window. We do not delete those rows when the window ends. After the window ends, the next request for the same code resets the count. ${
      launch
        ? `The retention job deletes the row about 24 to 48 hours after the window ends. ${BACKLOG_CAVEAT}`
        : 'A row that is never requested again stays in the database while the retention job is off.'
    }`,
    `The quiz result limit counts for ${result}. That row stores a code made from a fixed label, the address code above, and the window start. The address code is still pseudonymous personal data. We delete the row after the window ends, when a later request runs cleanup. That cleanup runs at most once a ${cleanup === 'one minute' ? 'minute' : cleanup} in each server process. If cleanup does not run, the expired row remains. The server process may also keep the address code in memory until the process stops.`,
    `Checkout and the billing portal do not use a network address. They store a code made from the account id and a secret key. The checkout window is ${account}. The billing portal window is ${windowPhrase(PORTAL_RATE_WINDOW_MS)}. ${
      launch
        ? `The retention job deletes those rows about 24 to 48 hours after the window ends. ${BACKLOG_CAVEAT}`
        : 'We do not delete those rows when the window ends while the retention job is off.'
    }`,
  ]
}

export const SHARING_PARAGRAPH =
  'We use Clerk for accounts, Stripe for payments, Beehiiv for the digest when it is connected, Google Analytics for site measurement when it is configured and analytics is allowed, Vercel to host the site and for cookieless analytics, and Turso to store the database. We do not sell personal information.'

export const TURSO_BACKUP_PARAGRAPH =
  "Deleted data may remain in our database provider's backups for a limited period before the backups expire."

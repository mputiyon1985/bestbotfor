import { OG_RATE_WINDOW_MS } from './og'
import {
  CHECKOUT_RATE_WINDOW_MS,
  FOUNDING_HOLD_RATE_LIMIT,
  FOUNDING_HOLD_RATE_WINDOW_MS,
  GO_RATE_WINDOW_MS,
  NEWSLETTER_RATE_WINDOW_MS,
  PORTAL_RATE_WINDOW_MS,
  RESULT_RATE_WINDOW_MS,
  RESULT_WINDOW_PURGE_INTERVAL_MS,
  SPONSOR_RATE_WINDOW_MS,
  SUGGESTION_RATE_WINDOW_MS,
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
 * whole answer, for tests. This is the write condition, not the launch
 * sequence. The launch pull request sets the code constant to true and
 * nothing else. The first production run leaves dry-run on or unset.
 * A later step sets dry-run to off. This function does not edit the
 * sentences one by one.
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
  const schedule = `it runs about once a day. It deletes a rate-limit row or a quiz-result row that is still there 24 hours after the window ends, so that deletion lands about 24 to 48 hours after the window ends. ${BACKLOG_CAVEAT} It removes the click address code after about 90 days and leaves the rest of the click row. It clears the optional email on a suggestion after 90 days and deletes a suggestion after 24 months.`
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
    `Newsletter signup stores that code with a count and a window end time. The window is ${newsletter}. Visit redirects use a ${visit} window. Social-card images use a ${card} window. The suggestion box uses a ${windowPhrase(SUGGESTION_RATE_WINDOW_MS)} window, sponsor checkout uses a ${windowPhrase(SPONSOR_RATE_WINDOW_MS)} window, and new founding sponsor holds use a separate limit of ${FOUNDING_HOLD_RATE_LIMIT} per ${windowPhrase(FOUNDING_HOLD_RATE_WINDOW_MS)}. We do not delete those rows when the window ends. After the window ends, the next request for the same code resets the count. ${
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

/** ctaOn adds the pages the newsletter CTA runs on (newsletterCtaEnabled()). */
export function newsletterSignupParagraph(ctaOn: boolean = false): string {
  return `If you join the newsletter, we store your email address. Before the digest is connected to Beehiiv, we keep that address as a pending signup and you are not subscribed yet. When the digest is connected, we send that email address to Beehiiv, including an address we stored while it was pending. We also send the utm_source, utm_medium, utm_campaign, and utm_content values from the link that first brought you to the site, when we recorded one. If we did not record one, we send utm_source set to bestbotfor and utm_medium set to website. We also send referring_site set to the absolute URL of the page that offered the form. That page is one of /, /result, /best, /compare, /newsletter, /ai-loadout, /guides/how-to-choose-an-ai-tool, /alternatives/chatgpt, /alternatives/midjourney, /alternatives/zapier, /alternatives/cursor, ${ctaOn ? '/alternatives/elevenlabs, or any page under /compare/, /alternatives/, /best/, or /guides/' : 'or /alternatives/elevenlabs'}. You get a confirmation email first (double opt-in). You are subscribed only after you confirm that message. We do not ask for your name on the form. We keep your email address and signup record while you are subscribed. After you unsubscribe, we keep that row so we do not email you again. It holds your email, the unsubscribe status, when it was created, where it was sent, the Beehiiv id when we have one, and the utm_source, utm_medium, utm_campaign, and utm_content values and landing page from the link that first brought you, when we recorded them. Beehiiv keeps its own record. We do not delete that row on a schedule. If you ask us to delete it, we delete our copy within 30 days. If you unsubscribe, we honor that. The signup form does not turn it back on. The only way back is your own resubscribe link.`
}

export const NEWSLETTER_SIGNUP_PARAGRAPH = newsletterSignupParagraph(false)

/** One line on first-touch attribution (James, Oct 19, 2026). Shown on /privacy. */
export const FIRST_TOUCH_PRIVACY_PARAGRAPH =
  'We record which link brought you to the site: the first time you arrive from a link with utm_source, utm_medium, utm_campaign, or utm_content tags, we save those tags, the page you landed on, and when you arrived in your browser\'s local storage (bbf_first_touch). We do not save it, and we do not send a saved copy, while your browser sends Global Privacy Control or after you reject analytics on the banner. On a newsletter signup we send only the utm_source, utm_medium, utm_campaign, and utm_content values to Beehiiv. We also keep those four tags and the landing page, but not the arrival time, with your newsletter signup record, as described in the next paragraph. On an account sign-up we send those tags, the landing page, and the arrival time to Clerk. The copy in your browser expires 90 days after you arrived, or sooner if you clear this site\'s data in your browser. Clerk keeps its copy with your account until you delete the account.'

const SUGGESTION_BASE =
  'If you suggest something, we store the feedback (whether you like something, want something added, or want something removed, and the message) and we store your email address only when you choose to include it. We use that email only to reply to you, and we do not add it to the newsletter or send it to Beehiiv.'

/** Retention for suggestions (James, Oct 18): email cleared after 90 days, row deleted after 24 months. */
export function suggestionPrivacyParagraph(input: RetentionCopyInput = {}): string {
  const rule = 'We keep your email address for up to 90 days so we can reply, then clear it and keep the note. We delete each suggestion 24 months after you send it.'
  if (retentionCopyOn(input)) {
    return `${SUGGESTION_BASE} ${rule} The retention job does this about once a day.`
  }
  return `${SUGGESTION_BASE} The retention job that applies our suggestion limits is off in production now, so until it is switched on, the email and the suggestion have no fixed deletion date. When it is switched on, we keep your email address for up to 90 days so we can reply, then clear it and keep the note, and we delete each suggestion 24 months after you send it.`
}

export const SUGGESTION_PRIVACY_PARAGRAPH = suggestionPrivacyParagraph()

export const SHARING_PARAGRAPH =
  'We use Clerk for accounts, Stripe for payments, Beehiiv for the digest when it is connected, Google Analytics for site measurement when it is configured and analytics is allowed, Vercel to host the site and for cookieless analytics, and Turso to store the database. We do not sell personal information.'

export const TURSO_BACKUP_PARAGRAPH =
  "Deleted data may remain in our database provider's backups for up to 30 days before they expire."

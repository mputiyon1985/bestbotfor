import { SPONSOR_CONTACT_EMAIL } from './sponsor-checkout-gate'
import { FOUNDING_SPONSOR_CAP } from './sponsor-offerings'

/**
 * The log tag for a sixth (or later) paid founder. Search the Vercel runtime
 * logs for it. The admin sponsors page shows the same rows under
 * "Founding cap exceeded".
 */
export const FOUNDING_CAP_ALERT_TAG = 'FOUNDING CAP EXCEEDED'

export type FoundingCapAlert = {
  sent: false
  reason: 'no-mail-transport'
  to: typeof SPONSOR_CONTACT_EMAIL
}

/**
 * Alert that a completed founding checkout took the paid founders past the
 * cap. This repo has no mail transport (see suggestion-mail.ts), so the alert
 * is one loud error log line plus the admin flag; no email is sent. It logs
 * only the Checkout session id and counts, never the buyer's email or company.
 * It never refunds: Mark decides refund or honor case by case.
 */
export function alertFoundingOverCap(input: { sessionId: string; paidFounders: number }): FoundingCapAlert {
  console.error(
    FOUNDING_CAP_ALERT_TAG,
    JSON.stringify({
      session: input.sessionId,
      paid_founders: input.paidFounders,
      cap: FOUNDING_SPONSOR_CAP,
      action: 'not refunded; Mark decides refund or honor; see /admin/sponsors',
    }),
  )
  return { sent: false, reason: 'no-mail-transport', to: SPONSOR_CONTACT_EMAIL }
}

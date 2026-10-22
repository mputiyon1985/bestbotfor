/**
 * One notice per stored suggestion, addressed to Mark.
 * This repo has no mail transport (no Resend, nodemailer, or SMTP client),
 * so the notice is a no-op: it sends nothing and logs nothing.
 * A later mail setup can replace the body of this function. Callers already
 * invoke it once, after the row is stored, and never on a honeypot hit.
 */
export const SUGGESTION_NOTIFY_EMAIL = 'mark@bestbotfor.com'

export type SuggestionNotice = {
  sent: false
  reason: 'no-mail-transport'
  to: typeof SUGGESTION_NOTIFY_EMAIL
}

export function notifySuggestion(_row: { id: number; kind: string }): SuggestionNotice {
  return { sent: false, reason: 'no-mail-transport', to: SUGGESTION_NOTIFY_EMAIL }
}

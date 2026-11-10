/**
 * The AI Stack Audit: a one-time $99 service sold through a Stripe hosted
 * Payment Link (created in the Stripe dashboard on 2026-10-27). The URL is a
 * public buy.stripe.com link and holds no secret. The price, delivery time and
 * refund window below are copy, not read from Stripe. If the link's Price or
 * description changes in Stripe, change this file in the same PR.
 */

export const AUDIT_PAYMENT_HOST = 'buy.stripe.com'

export const AUDIT_PAYMENT_URL = 'https://buy.stripe.com/bJe28scQgbSigg2d7ufrW05'

export const AUDIT_PRICE_LABEL = '$99, one time'

export const AUDIT_DELIVERY = 'within 2 business days'

export const AUDIT_REFUND_LINE =
  'If the audit is not useful, email mark@bestbotfor.com within 7 days for a full refund.'

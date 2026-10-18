# Sponsor rejection and refunds

Refunds stay manual. Nothing in the app calls the Stripe refund API.

## Live webhook

The live endpoint is `POST /api/stripe/webhook`. The route is `src/app/api/stripe/webhook/route.ts`. It handles these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `charge.refunded`
- `refund.created`
- `refund.updated`

This runbook does not name an endpoint id or a signing secret. A succeeded refund, including a partial refund, sets `refunded_at` and hides the placement. A failed refund does not.

## Fulfillment until admin approval ships

Gate 19 (`ADMIN_SPONSORS` production launch) is still open. `/admin/sponsors` returns 404. Do not use that page to approve a card, reject a card, or mark a refund.

1. Find the payment in the Stripe dashboard.
2. The operator approves the card with a Mark-approved production write, coordinated by James.

That write is the approval until gate 19 ships the admin queue. It does not call Stripe.

## Reject reasons

A rejection needs a reason of 3 to 500 characters. The first rejection leaves the card `rejected` and opens one resubmission for 7 days. It does not refund the payment. The buyer uses the Checkout success page, with the same session id, to submit one new version. That version is pending and has to be approved again, with the same Mark-approved production write, coordinated by James.

## Resubmission window

There is one resubmission, and only within 7 days of the first rejection. A second rejection sets the admin status to `refund_pending`. If the buyer does not resubmit within 7 days, the next review-queue load or resubmission attempt sets `refund_pending`. Either transition writes an audit row. Operators do not open `/admin/sponsors` for that load. The page returns 404 until gate 19.

## Refunding in the Stripe dashboard

When the status is `refund_pending`, find the payment in the Stripe dashboard and refund it there. Do not expect the app to refund it. The live webhook above records a succeeded refund.

## Recording the refund

After the Stripe dashboard shows the refund, the operator records it with a Mark-approved production write, coordinated by James. That write does not call Stripe. A second record does nothing. Do not use `/admin/sponsors` for this. That page returns 404 until gate 19.

## Card rules

A card URL must be https. IP addresses, localhost, and internal host names are refused. Logos are PNG, JPEG, or WebP, at most 64 KB, with EXIF and other metadata removed. Text is normalized to NFKC. ZWJ and ZWNJ stay. Other invisible characters are removed.

## Audit

Approve and reject rows live in `sponsorship_review_events` and include the content hash and version. `refund_pending` and `refunded` live in `sponsorship_refund_events`. Both tables reject updates, deletes, and `INSERT OR REPLACE`.

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

This runbook does not name an endpoint id or a signing secret. The repo shows which events the handler accepts. Which events the live Stripe endpoint is subscribed to is set in the Stripe dashboard.

A succeeded refund, including a partial refund, sets `sponsorships.refunded_at` and hides the placement. That happens for `charge.refunded` when `refunded` is true or `amount_refunded` is above 0, and for `refund.created` or `refund.updated` only when the refund `status` is `succeeded`. A failed refund does not set it. `refunded_at` is set once. The webhook does not touch the card's `refund_status` or `sponsorship_refund_events`. See "Recording the refund".

## Where the review queue opens

`/admin/sponsors` opens in preview, development, and test when `ADMIN_SPONSORS` is `on` and `VERCEL_ENV` is `preview`, `development`, or `test` (`adminSponsorsEnabled` in `src/lib/flags.ts` trims both values first). Any other value is off. The allowlist, a completed second factor, a fresh step-up for approve, reject, and mark refunded, and the version, update time, and content hash check all still apply there. Responses stay `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`.

In production the page returns 404 until gate 19, because `ADMIN_SPONSORS_PRODUCTION_LAUNCH` is false. The production steps below are for that period. Each one is a Mark-approved production write, coordinated by James. Each write must do exactly what the app function named in that step does, in the same order, with the same guard. None of these writes calls Stripe.

## Approving a card in production until gate 19

1. Find the payment in the Stripe dashboard and match it to the `sponsorships` row (`stripe_payment_intent_id`, paid, `refunded_at` empty).
2. Approve the pending `sponsorship_creatives` row the way `recordSponsorCardReview` in `src/lib/sponsor-card.ts` does:
   - Update only the row whose `status` is `pending` and whose `version`, `updated_at`, and `content_hash` match the card that was reviewed.
   - Set `status` to `approved` and `updated_at` to now.
   - Copy the pending `tool_name`, `description`, `url`, `logo_mime`, `logo_bytes`, `content_hash`, and `version` into `approved_tool_name`, `approved_description`, `approved_url`, `approved_logo_mime`, `approved_logo_bytes`, `approved_content_hash`, and `approved_version`.
   - Insert one `sponsorship_review_events` row with the creative id, sponsorship id, actor, decision `approved`, reason, content hash, version, and time.

Setting `status` to `approved` on its own does not publish anything. `approvedCardsForSponsorships` skips a row whose approved name, description, URL, logo type, or logo bytes are empty. The public `/best` page renders only that approved snapshot.

## Reject reasons

A rejection needs a reason of 3 to 500 characters. It goes through the same `recordSponsorCardReview` guard: status `pending` and a matching version, update time, and content hash. It sets `status` to `rejected` and `rejected_at`, and it inserts a `sponsorship_review_events` row. The first rejection opens one resubmission for 7 days. It does not refund the payment. The buyer uses the Checkout success page, with the same session id, to submit one new version. That version is pending and has to be approved again.

## Resubmission window

There is one resubmission, and only within 7 days of the first rejection.

- **A second rejection** sets the card's `refund_status` to `refund_pending` in the same review write. It also inserts a `sponsorship_refund_events` row with decision `refund_pending`.
- **The 7-day expiry has no clock or scheduled job of its own.** `expireSponsorResubmissions` runs only when the review queue lists load (`listPendingSponsorCards`, `listRefundPendingSponsorCards`) or when the buyer submits a card (`saveSponsorCardForSession`). It moves a card that is `rejected`, has no `refund_status`, has no resubmission, and was rejected 7 or more days ago to `refund_pending`. It inserts a `sponsorship_refund_events` row with actor `system`.
- **Until gate 19 in production**, nobody loads the queue. A buyer who never resubmits stays `rejected` with no `refund_status`. Check the rejected cards for that case. For each one past 7 days, a Mark-approved production write, coordinated by James, makes the same change as `expireSponsorResubmissions`, with the same conditions, and inserts the matching `sponsorship_refund_events` row.

## Refunding in the Stripe dashboard

When `refund_status` is `refund_pending`, find the payment in the Stripe dashboard and refund it there. The app never calls the Stripe refund API. When the refund succeeds, the webhook sets `sponsorships.refunded_at` and the placement is hidden. That is the only effect of the webhook.

## Recording the refund

Recording the refund is a separate write, on the card, not on `sponsorships`. It does what `markSponsorRefunded` does:

- Update `sponsorship_creatives` to `refund_status = 'refunded'` only where the row's id matches and `refund_status` is `refund_pending`.
- If that update changed a row, insert one `sponsorship_refund_events` row with decision `refunded`, the actor, and a reason of 3 to 500 characters.
- If it changed no row, insert nothing.

The `refund_pending` condition is what makes a second record do nothing. A free-form insert into `sponsorship_refund_events` has no such guard, so don't write the event without the guarded update. In preview, development, and test, the queue's "mark refunded" button calls `markSponsorRefunded`.

## Card rules

A card URL must be https. IP addresses, localhost, and internal host names are refused. Logos are PNG, JPEG, or WebP, at most 64 KB, with EXIF and other metadata removed. Text is normalized to NFKC. ZWJ and ZWNJ stay. Other invisible characters are removed.

## Audit

Approve and reject rows live in `sponsorship_review_events` and include the content hash and version. `refund_pending` and `refunded` rows live in `sponsorship_refund_events`. Database triggers on both tables reject updates, deletes, and `INSERT OR REPLACE` of an existing id. They do not stop a new, unguarded insert, which is why each production write above pairs its event insert with the guarded update.

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

The route returns 400 (`live-mode-rejected`) for every live-mode event unless `STRIPE_ALLOW_LIVE` is exactly `true` in that environment. Events the handler does not list, such as `invoice.paid`, `invoice.payment_failed`, and the `charge.dispute.*` events, are logged with `console.info` and answered 200. They still write and finish a `stripe_events` idempotency row, but change no sponsorship or membership data.

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
- A blank reason is stored as "Refunded in the Stripe dashboard."

The `refund_pending` condition is what makes a second record do nothing. A free-form insert into `sponsorship_refund_events` has no such guard, so don't write the event without the guarded update. In preview, development, and test, the queue's "mark refunded" button calls `markSponsorRefunded`.

## Payment Link sales

Two live Stripe Payment Links sell sponsor slots outside the app's `/sponsor` checkout:

- **Founding:** `plink_1URylTIJUbygfAuc07cebXfn`. $99 for the first 2 weeks, then $299/mo. Founding price locked for 6 months. Cancel anytime. Capped at 5 completed sales.
- **Monthly:** `plink_1URyeXIJUbygfAucnLlkSP5u`. $299/mo.

Both ask for a required `best_page` custom field: the `/best` page the buyer wants. Their metadata has no `kind=sponsorship`, so the webhook does not treat them as sponsorships. They create no `sponsorships` row, no card, and no placement. Their subscription events upsert a row in the membership `subscriptions` table with no `clerk_user_id`. Membership checks look rows up by user id, so that row grants nothing.

### Buyer details

Both links collect the buyer's email, name, and a required billing address. Refer to a sale only by its Stripe object id (`cs_…`, `pi_…`, or `sub_…`). Never paste the buyer's email, name, or address into Slack, chat, tickets, the repo, or the launch plan. Contact the buyer from the Stripe customer record. Store only what the `sponsorships` row below needs, and leave its `email` and `company` columns empty.

### Fulfillment

1. **The alert.** The payment watch reports a new completed Checkout session, charge, or invoice on the live account. That is James's check of the Stripe account, not an app feature. Open the payment in the Stripe dashboard and confirm it succeeded and which link it came from.
2. **The page.** Read the `best_page` custom field on the Checkout session. Confirm it names a real `/best/[task]` page. If it does not, ask the buyer before publishing anything.
3. **The slot.** A Payment Link sale does not reserve the `/best` slot. Until the row in step 5 exists, `/sponsor` Checkout can still sell the same page, and the page shows only the newest paid placement, so one paying sponsor would get nothing. Before confirming the sale, check that the requested page has no `paid` `sponsorships` row without `refunded_at` whose window is in or overlaps the new window. If it is taken, tell the buyer and offer another page or later dates. Once the row in step 5 exists, it blocks `/sponsor` claims for that page in that window.
4. **The card.** Get the tool card (name, description, https URL, logo) from the buyer. The same card rules apply as for `/sponsor` sales.
5. **Publishing.** The `/best` placement shows only a `paid` `sponsorships` row for that task, with no `refunded_at`, inside its window, and with an approved card. The window is 7 days for `placement_weekly` and 30 days for `placement_monthly`, both starting at `paid_at`. A Payment Link sale has none of that, so publishing needs Mark's OK, via James, for the production data write. That write creates the `sponsorships` row and the pending card, then approves the card through the same guarded path as `recordSponsorCardReview`: copy the pending card into the `approved_*` columns and insert the `sponsorship_review_events` row. A status flip alone does not publish. The row has:
   - `stripe_checkout_session_id`: the sale's `cs_…` id for the first period. The column is unique, so each later period needs its own unique key (for example `<cs_…>:<invoice id>`).
   - `stripe_payment_intent_id`: the payment intent of that period's payment.
   - `offering`: `placement_weekly` or `placement_monthly`.
   - `status`: `paid`.
   - `paid_at`: the start of the window, normally the time of that period's payment. It is never moved later.
   - `task_slug`: the task from `best_page`.
6. **Windows.** The app has no 2-week window for the Founding first period, and no renewal for later months. A monthly Stripe period is a calendar month, while the app window is 30 days, so a 31-day month can leave a 1-day gap. Each paid period needs its own decision and write, approved the same way, with its window starting at that invoice's payment. Agree the exact rows with James before writing.

### Sponsored label and disclosure

A Payment Link placement is published only through the `sponsorships` row and an approved card. That is what gives it the "Sponsored" label on `/best` and puts it under `/disclosure`. Never feature a sponsor by editing catalog data, rankings, or page copy. That would be an unlabeled ad. Payment never buys rank.

### Refunds and cancellations

Refund or cancel in the Stripe dashboard. The refund webhook matches `sponsorships` by payment intent. When the row from Fulfillment step 5 carries the refunded payment's payment intent, a dashboard refund of that payment intent sets `refunded_at` and hides the placement automatically. If there is no row for the period, or it carries a different payment intent, the webhook hides nothing; removing a published placement is then a Mark-approved production write, coordinated by James, on the row that write created. A cancelled subscription stops future invoices only. The current period's placement stays up until its window ends, unless it is refunded or removed.

### The 6-month price lock

Stripe does not enforce the Founding lock. The subscription stays on the $299 price, and nothing in the app or in Stripe changes it after 6 months. Keep that price for 6 months from the first payment, and do not change it by hand. Any price change after that is a separate decision.

### Disputes

This applies to every sponsor sale, both Payment Link sales and `/sponsor` Checkout sales. `charge.dispute.*` events reach the webhook, which logs them and changes nothing in the app. Handle the dispute in the Stripe dashboard: respond with the evidence (the Checkout session, the `best_page` value or the `/sponsor` task, the published placement, and its dates). If the placement should come down while the dispute is open, that is a Mark-approved production write, coordinated by James.

## Card rules

A card URL must be https. IP addresses, localhost, and internal host names are refused. Logos are PNG, JPEG, or WebP, at most 64 KB, with EXIF and other metadata removed. Text is normalized to NFKC. ZWJ and ZWNJ stay. Other invisible characters are removed.

## Audit

Approve and reject rows live in `sponsorship_review_events` and include the content hash and version. `refund_pending` and `refunded` rows live in `sponsorship_refund_events`. Database triggers on both tables reject updates, deletes, and `INSERT OR REPLACE` of an existing id. They do not stop a new, unguarded insert, which is why each production write above pairs its event insert with the guarded update.

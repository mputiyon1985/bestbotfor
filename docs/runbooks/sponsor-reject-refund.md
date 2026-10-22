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

The route returns 400 (`live-mode-rejected`) for every live-mode event unless `VERCEL_ENV` is exactly `production` and `STRIPE_ALLOW_LIVE` is exactly `true`. `invoice.paid` and `invoice.payment_failed` are handled for sponsor subscriptions (they move `paid_through` forward and mark `past_due`; see `docs/runbooks/sponsor-subscriptions.md`). Events the handler does not list, such as the `charge.dispute.*` events, are logged with `console.info` and answered 200. They still write and finish a `stripe_events` idempotency row, but change no sponsorship or membership data.

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

- **Founding:** `plink_1URylTIJUbygfAuc07cebXfn`. $99 for the first 2 weeks, then $299/mo. Founding price locked for 6 months. Cancel anytime. Capped at 5 founding sponsors in total, shared with the app's in-app founding offer (one cap, James, Oct 18). It stays live as the only founding path until cutover, where it is deactivated first (sponsor-subscriptions runbook, post-merge step 0(a)), before the founding Prices are set.
- **Monthly:** `plink_1URyeXIJUbygfAucnLlkSP5u`. $299/mo.

Both ask for a required `best_page` custom field: the `/best` page the buyer wants. Their metadata has no `kind=sponsorship`, so the webhook does not treat them as sponsorships. They create no `sponsorships` row, no card, and no placement. Their subscription events upsert a row in the membership `subscriptions` table with no `clerk_user_id`. Membership checks look rows up by user id, so that row grants nothing.

### Buyer details

Both links collect the buyer's email, name, and a required billing address. Refer to a sale only by its Stripe object id (`cs_…`, `pi_…`, or `sub_…`). Never paste the buyer's email, name, or address into Slack, chat, tickets, the repo, or the launch plan. Contact the buyer from the Stripe customer record. Store only what the `sponsorships` row below needs, and leave its `email` and `company` columns empty.

### Fulfillment

1. **The alert.** The payment watch reports a new completed Checkout session, charge, or invoice on the live account. That is James's check of the Stripe account, not an app feature. Open the payment in the Stripe dashboard and confirm it succeeded and which link it came from.
2. **The page.** Read the `best_page` custom field on the Checkout session. Confirm it names a real `/best/[task]` page. If it does not, ask the buyer before publishing anything.
3. **The slot.** A Payment Link sale does not reserve the `/best` slot. Until the row in step 5 exists, `/sponsor` Checkout can still sell the same page, and the page shows only the newest paid placement, so one paying sponsor would get nothing. Before confirming the sale, check that the requested page has no `paid` `sponsorships` row without `refunded_at` whose window is in or overlaps the new window. A renewing subscription row (`founding_sponsor` or `placement_subscription` with `subscription_status` `active`, `trialing`, or `past_due` and no `cancel_at` or `canceled_at`) holds the page with no end date, not just until `paid_through`; only a scheduled or past cancel ends it at `paid_through`. For a Founding sale, also check the shared cap: the app's founding count (paid unrefunded `founding_sponsor` rows plus `founding_link:` sales plus live founding holds) must be below 5, or the sale cannot be confirmed. Also check `sponsorship_slot_claims` for an unexpired `/sponsor` claim on that task: a row whose `claimed_at` is less than 24 hours old (65 minutes for a `founding_sponsor` hold whose `request_key` contains `|`; 24 hours + 5 minutes for a legacy founding hold with a bare `request_id`) means a `/sponsor` Checkout for that page may still complete. If either is taken, tell the buyer and offer another page or later dates. Once the row in step 5 exists, it blocks `/sponsor` claims for that page in that window.
4. **The card.** Get the tool card (name, description, https URL, logo) from the buyer. The same card rules apply as for `/sponsor` sales.
5. **Publishing.** The `/best` placement shows only a `paid` `sponsorships` row for that task, with no `refunded_at`, inside its window, and with an approved card. The window is 7 days for `placement_weekly` and 30 days for `placement_monthly`, both starting at `paid_at`. A Payment Link sale has none of that, so publishing needs Mark's OK, via James, for the production data write. That write creates the `sponsorships` row and the pending card, then approves the card through the same guarded path as `recordSponsorCardReview`: copy the pending card into the `approved_*` columns and insert the `sponsorship_review_events` row. A status flip alone does not publish. The row has:
   - `stripe_checkout_session_id`: the sale's `cs_…` id for the first period. The column is unique, so each later period needs its own unique key (for example `<cs_…>:<invoice id>`). **Founding link sales use the prefix `founding_link:`**: `founding_link:<cs_…>` for the first period and `founding_link:<cs_…>:<in_…>` for later ones. That prefix is how the app counts the sale toward the shared cap of 5; a founding row without it is not counted. Monthly link sales use no prefix.
   - `stripe_payment_intent_id`: the payment intent of that period's payment. A subscription Checkout session has no payment intent of its own, so take the `pi_…` from that period's invoice payment in the Stripe dashboard.
   - `offering`: `placement_weekly` or `placement_monthly`.
   - `status`: `paid`.
   - `paid_at`: the start of the window, normally the time of that period's payment. It is never moved later.
   - `task_slug`: the task from `best_page`.

   **Founding link counting rule.** The app counts a founding link sale toward the shared cap of 5 only while its first-period row (`founding_link:<cs_…>`, no `:<in_…>` suffix) is `paid` and unrefunded. Renewal rows never count on their own. So refunding the first period frees the spot, and a renewal row written later does not take it back. Keeping a refunded founder's spot is a rare manual exception that needs Mark's OK: first run the check query below and confirm the webhook has already set `refunded_at` on the first-period row, and wait until every refund event for that payment (`charge.refunded`, `refund.created`, `refund.updated`, including any retries) shows delivered in the Stripe Dashboard; only then clear `refunded_at` on that row, then re-run the check query, and re-run it again the next day. Any later refund on that payment frees the spot again.

   **Refunded first period, renewals still paid.** That founder is no longer counted, but its renewal rows still place the card, so the page keeps showing it while the spot looks free; if the spot is resold, six founders show. (F), decided by James: refunding a founder's first-period `pi_…` in Stripe frees their spot automatically, because the webhook sets `refunded_at` on that first-period row; no row fix is needed. If the first period is refunded but the founder should keep the spot, that is a manual exception that needs Mark's OK: after the refund, run the check query below and confirm the webhook has already set `refunded_at` on that first-period row (if it is still empty, wait and re-check; never clear it before the webhook has set it, or the late webhook will set it again and free the spot). Each refund sends up to three events (`charge.refunded`, `refund.created`, `refund.updated`), and each sets `refunded_at` when it is empty, and Stripe retries failed deliveries, so also wait until every one of those events for that payment, including any retries, shows delivered in the Stripe Dashboard. Only then a write clearing `refunded_at` on that row, then a re-run of the check query, and another re-run the next day. Any later refund on that payment frees the spot again. To end a founder, cancel the founder's subscription in the dashboard and mark the renewal rows refunded (set `refunded_at`), with Mark's OK. The key is matched trimmed and case-insensitively, but always write it exactly as below.

   Copy-paste template (Mark-approved production write only; fill every `<…>`, times in Unix milliseconds, `email` and `company` stay empty):

   ```sql
   -- First period of a founding Payment Link sale. For a later period use
   -- 'founding_link:<cs_…>:<in_…>' and that period's pi_ and paid_at.
   -- Monthly Payment Link sales use the plain '<cs_…>' or '<cs_…>:<in_…>' key, with no prefix.
   INSERT INTO sponsorships
     (stripe_checkout_session_id, stripe_payment_intent_id, offering, status,
      task_slug, paid_at, created_at, updated_at)
   VALUES
     ('founding_link:<cs_…>', '<pi_…>', 'placement_monthly', 'paid',
      '<task>', <paid_at_ms>, <now_ms>, <now_ms>);
   ```

   Check query (read-only) after the write. Every founding row must show `first_period = 1` for the first period, and `counts = 1` exactly for founders who hold a spot:

   ```sql
   SELECT id, stripe_checkout_session_id, offering, status, task_slug, paid_at, refunded_at,
          (instr(substr(lower(trim(stripe_checkout_session_id)), 15), ':') = 0) AS first_period,
          (instr(substr(lower(trim(stripe_checkout_session_id)), 15), ':') = 0
            AND substr(lower(trim(stripe_checkout_session_id)), 15) != ''
            AND offering IN ('placement_weekly', 'placement_monthly')
            AND status = 'paid' AND refunded_at IS NULL) AS counts
   FROM sponsorships
   WHERE lower(trim(stripe_checkout_session_id)) LIKE 'founding_link:%'
   ORDER BY stripe_checkout_session_id;
   ```

   Flag any sale whose rows all show `first_period = 0`: it has renewal rows but no first-period row, so it is not counted. This query lists such sales directly; it must return no rows:

   ```sql
   SELECT substr(lower(trim(stripe_checkout_session_id)), 15,
            instr(substr(lower(trim(stripe_checkout_session_id)), 15), ':') - 1) AS sale
   FROM sponsorships
   WHERE lower(trim(stripe_checkout_session_id)) LIKE 'founding_link:%'
     AND instr(substr(lower(trim(stripe_checkout_session_id)), 15), ':') > 0
   GROUP BY sale
   HAVING sale NOT IN (
     SELECT substr(lower(trim(stripe_checkout_session_id)), 15) FROM sponsorships
     WHERE lower(trim(stripe_checkout_session_id)) LIKE 'founding_link:%'
       AND instr(substr(lower(trim(stripe_checkout_session_id)), 15), ':') = 0
   );
   ```

   SQLite `trim()` strips spaces only, so a key with a leading tab or newline, or a typo such as `founding_lnk:`, is not listed above and not counted. Run this near-miss query too; every row it returns that is not in the check query output needs its key fixed:

   ```sql
   SELECT id, stripe_checkout_session_id, offering, status, refunded_at
   FROM sponsorships
   WHERE lower(stripe_checkout_session_id) LIKE '%found%'
     AND lower(trim(stripe_checkout_session_id)) NOT LIKE 'founding_link:%';
   ```

   A row you meant as founding that the check query does not list (a typo in the prefix) is not counted; fix its key with a Mark-approved write.
6. **Windows.** The app has no 2-week window for the Founding first period, and no renewal for later months. A monthly Stripe period is a calendar month, while the app window is 30 days, so a 31-day month can leave a 1-day gap. Each paid period needs its own decision and write, approved the same way, with its window starting at that invoice's payment. Agree the exact rows with James before writing.

### Sponsored label and disclosure

A Payment Link placement is published only through the `sponsorships` row and an approved card. That is what gives it the "Sponsored" label on `/best` and puts it under `/disclosure`. Never feature a sponsor by editing catalog data, rankings, or page copy. That would be an unlabeled ad. Payment never buys rank.

### Refunds and cancellations

Refund or cancel in the Stripe dashboard. The refund webhook matches `sponsorships` by payment intent. When the row from Fulfillment step 5 carries the refunded payment's payment intent, a dashboard refund of that payment intent sets `refunded_at` and hides the placement automatically. If there is no row for the period, or it carries a different payment intent, the payment-intent match hides nothing. Subscription rows created by the app's own checkout also match through the invoice's subscription, so for those a refund can hide the placement even without a payment intent on the row. A refund with no invoice is never matched on the customer; it is logged as `unmatched sponsor refund, manual handling needed` and handled by hand. In those unmatched cases removing a published placement is then a Mark-approved production write, coordinated by James, on the row that write created. A cancelled subscription stops future invoices only. The current period's placement stays up until its window ends, unless it is refunded or removed.

### The 6-month price lock

Stripe does not enforce the Founding lock. The subscription stays on the $299 price, and nothing in the app or in Stripe changes it after 6 months. Keep that price for 6 months from the first payment, and do not change it by hand. Any price change after that is a separate decision.

### Disputes

This applies to every sponsor sale, both Payment Link sales and `/sponsor` Checkout sales. `charge.dispute.*` events reach the webhook, which logs them and changes nothing in the app. Handle the dispute in the Stripe dashboard: respond with the evidence (the Checkout session, the `best_page` value or the `/sponsor` task, the published placement, and its dates). If the placement should come down while the dispute is open, that is a Mark-approved production write, coordinated by James.

## Card rules

A card URL must be https. IP addresses, localhost, and internal host names are refused. Logos are PNG, JPEG, or WebP, at most 64 KB, with EXIF and other metadata removed. Text is normalized to NFKC. ZWJ and ZWNJ stay. Other invisible characters are removed.

## Audit

Approve and reject rows live in `sponsorship_review_events` and include the content hash and version. `refund_pending` and `refunded` rows live in `sponsorship_refund_events`. Database triggers on both tables reject updates, deletes, and `INSERT OR REPLACE` of an existing id. They do not stop a new, unguarded insert, which is why each production write above pairs its event insert with the guarded update.

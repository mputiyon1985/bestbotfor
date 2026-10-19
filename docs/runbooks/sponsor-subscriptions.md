# Sponsor subscriptions: founding offer and monthly subscription

Two recurring sponsor offerings sit next to the one-time prices on `/sponsor`:

| Offering id | What the buyer pays | Stripe objects |
| --- | --- | --- |
| `founding_sponsor` | $99 today for the first 2 weeks, then $299/mo. Founding price locked for 6 months. Cancel anytime. Limited to 5 founding sponsors. | One-time Price `sponsor_founding_first_two_weeks` ($99) and recurring monthly Price `sponsor_founding_monthly` ($299), with a 14-day trial on the recurring item |
| `placement_subscription` | $299/mo, renewing until canceled | Recurring monthly Price `sponsor_best_placement_monthly_recurring` ($299) |

Both are a featured placement on one `/best/[task]` page, with the same tool card review as the one-time placements.

## Why this Stripe design

- **Checkout `mode=subscription`, with a one-time $99 line item and `subscription_data.trial_period_days=14` on the $299/mo Price.** Stripe charges a one-time Price on the subscription's first invoice even while the recurring item is in a trial. The buyer pays $99 at checkout, the card is saved (`payment_method_collection=always`), and the first $299 charge happens automatically when the trial ends on day 14. All of this is native Checkout, needs no extra API calls after checkout, and works with the API version this app pins (`2026-09-30.endive`).
- **Not Stripe Trial Offers.** Trial Offers model a paid introductory price, but on Checkout they are a private preview that needs a preview API version and flexible billing mode. They are not used here.
- **Not a subscription schedule.** A schedule cannot be created by Checkout. It would need a second API write after every checkout, plus webhook handling for schedule phases. The founding price does not need to change after 6 months, because the founding and standard monthly prices are both $299 today, so a schedule would add moving parts without changing what anyone is charged.
- **How the 6-month lock is kept.** The founding subscription uses its own Price (`sponsor_founding_monthly`). A later change to the standard monthly Price, or a new Price under a moved lookup key, does not touch existing founding subscriptions, because a Stripe subscription keeps the Price it was created with. The lock end is stored on the subscription metadata (`price_lock_months=6`) and in `sponsorships.price_locked_until` (subscription `start_date` plus 6 calendar months, UTC). After that date nothing changes automatically. Moving a founding sponsor to a later standard price is a manual dashboard change.
- **Price lock, not a commitment** (James, Oct 18). The founding sponsor can cancel anytime. The 6 months only guarantee the $299 price. There is no minimum term, in the copy or in code.
- **Cancellation.** There is no customer portal in this app. To cancel, the sponsor emails mark@bestbotfor.com (the `/sponsor` copy should say so: "To cancel, email mark@bestbotfor.com"), and the cancellation is made in the Stripe dashboard with **Cancel at end of period**. The placement then runs to the end of the paid month and stops.
- **5 founding sponsors, one shared cap** (James, Oct 18). There are only ever 5 founding sponsors across the app offer and the live founding Payment Link (`plink_1URylT…`). `claimSponsorSlot` refuses a founding checkout once 5 spots are in use: paid, unrefunded `founding_sponsor` rows (a canceled founding sponsor still counts), plus founding Payment Link sales recorded as manual rows whose `stripe_checkout_session_id` starts with `founding_link:` (one spot per sale, counted only while its first-period row `founding_link:<cs_…>` is paid and unrefunded; renewal rows never count on their own; see `docs/runbooks/sponsor-reject-refund.md`), plus founding checkout holds younger than 65 minutes (`FOUNDING_HOLD_MS`). A hold is skipped only when the page's paid founding row came from that hold (`paid_at` at or after the hold's `claimed_at`), so a canceled, ended founder on the same page does not hide a new hold. The count and the hold are one SQL statement, so two buyers cannot both take the last spot. A refund (`refunded_at`) frees the spot. The buyer sees "All 5 founding sponsor spots are taken. Choose another option." The standard $299/mo subscription is not capped.
- **Founding sold out** (Mark approved building it, 2026-10-19). `/sponsor` reads the same shared count (`foundingSoldOutNow` → `foundingSpotsLeft` in `src/lib/sponsor-availability.ts`) on every request, only while the founding offer could otherwise be bought (surface open, Stripe key set, both founding Prices set). At 0 spots left the founding radio is disabled and labeled "Founding sponsor · Sold out", its line reads "All founding sponsor spots are taken.", and the price list says "Founding sponsor: Sold out. All 5 founding sponsor spots are taken." with no price or terms. A failed read logs only the error name and leaves the option open: the display is advisory, and the checkout claim decides.
  - **Server-side refusal.** The checkout server action (`sponsorCheckoutAction`, the only way to start a sponsor Checkout; `POST /api/sponsor/checkout` never creates a session) calls `claimSponsorSlot` before saving the card or calling Stripe. Past the cap it returns "All 5 founding sponsor spots are taken. Choose another option." and no hold, card or Checkout session is created. A buyer whose page was loaded before the last spot went gets this message on submit.
  - **Race guard (reused, no new mechanism).** The hold is the existing `sponsorship_slot_claims` reservation: one `INSERT … SELECT … WHERE (founding count) < 5` statement, so SQLite/libSQL serializes it and two checkouts that start at 4/5 cannot both get the last spot (one gets the hold, the other the sold-out message). A live founding hold counts toward the 5 for 65 minutes from its `claimed_at`, so `/sponsor` can show Sold out while the fifth buyer is still in Checkout; it reopens when that hold lapses, or when a hold this attempt created is released before Stripe was called.
  - **Short founding hold (Sentinel QA of #98).** A founding Checkout session is created with `expires_at` = the hold's `claimed_at` + 60 minutes (Stripe accepts 30 minutes to 24 hours), and the hold counts for 65 minutes (`src/lib/sponsor-hold-window.ts`), so a session can never complete after its hold stopped counting. A repeat of the same form (same `request_id`) while the hold is live keeps the hold's `claimed_at`: it sends the same `expires_at` under the same idempotency key (`…-h<claimed_at>`), so Stripe replays the session it already made, and the hold is never extended. Once the hold lapses, the same form takes a new hold. A founding hold is released early only when the attempt that created it fails before Stripe is called (a card-save failure); after a Stripe call it runs its 65 minutes, because a session may exist. When less than 30 minutes of the session are left and Stripe cannot start it, the buyer sees "This founding checkout timed out. The spot stays held for N minutes; reload the page after that to start again." Placement holds keep Stripe's default 24-hour expiry. The idempotency key and body are fixed for a hold's lifetime only when the form is unchanged; refusing an edited form under a live hold, and the completion-time recount, come in the follow-up (#98).
  - **Legacy founding holds (Reviewer must-fix on #103).** A founding hold written before this deploy stores the bare `request_id` as `request_key`; its Checkout session has Stripe's default 24-hour expiry and the idempotency key `sponsor-<fingerprint>-<request_id>` (no `-h`). Every founding hold written by this code stores `<request_id>|s`, so a founding row whose `request_key` has no `|` is legacy. A legacy hold keeps counting toward the cap, and keeps its page, for 24 hours + 5 minutes from `claimed_at` (`LEGACY_FOUNDING_HOLD_MS`). A retry of its own `request_id` on its page writes nothing and sends the pre-#103 body (no `expires_at`) under the pre-#103 key, so Stripe replays the original session and never opens a second one. It is not a new hold, so it does not use the per-address limit. In the last minute of the 24-hour session the retry gets the timed-out message without calling Stripe. After 24 hours + 5 minutes the spot is free and the same form takes a new short hold.
  - **Before merging #103 (optional).** To retire legacy sessions instead of letting them run their 24 hours, expire any open founding Checkout session in the Stripe dashboard (Payments → Checkout sessions, status Open, metadata `offering=founding_sponsor`; or `POST /v1/checkout/sessions/<cs_…>/expire`) just before the merge. This is a live Stripe write and needs Mark's OK. Without it the code above keeps the cap correct; with it a legacy retry gets an expired session and the buyer reloads `/sponsor` for a new one once the legacy hold lapses.
  - **Per-address founding hold limit.** On top of the sponsor checkout limit (8 an hour), each network address gets at most 2 new founding holds in 24 hours (`FOUNDING_HOLD_RATE_LIMIT`, `allowRate` key `founding_hold`, fails closed). A repeat of a live hold's own request does not count. Past the limit the new hold is released at once and the buyer sees "Too many founding sponsor checkouts from this network today. Try again tomorrow, or email mark@bestbotfor.com." Before this, one address could hold all 5 spots for free with 5 submits.
  - **Refunds (rule F, James, Oct 18).** Refunding a founder's first period frees the spot automatically: the refund webhook (`charge.refunded`, `refund.*`) sets `refunded_at`, and refunded rows do not count. Keeping the spot after a refund is a rare manual exception with Mark's OK. Wait until every refund event shows delivered, then re-check the count; it uses the same query as the page.
  - No migration: this reads existing tables (`sponsorships`, `sponsorship_slot_claims`).
- **No cap recheck at completion.** The cap is checked only when the founding Checkout session is created (the hold); the webhook records a completed founding checkout even if the cap filled in the meantime. At cutover, deactivating the founding Payment Link (step 0(a)) and then writing every founding link row (step 0(b)) before the founding Prices go live (steps 1 to 3) is what prevents a sixth founder.
- **Which page.** Every placement, including both subscriptions, requires "Which /best page do you want to sponsor?" (`task_slug`). The server refuses a placement without a valid page.

## Membership checkout status fix

`checkout.session.completed` for a membership subscription used to write `subscriptions.status = 'incomplete'` on every run. When it was processed after `customer.subscription.created`, it set a `trialing` or `active` membership back to `incomplete`. It now only seeds `incomplete` on a new row and leaves an existing status alone. `checkout.session.async_payment_succeeded` only moves a new or `incomplete` row to `active`. `customer.subscription.*` still always sets the status.

## How fulfillment works

The webhook (`src/lib/stripe-webhook.ts`) keeps one `sponsorships` row per subscription, keyed by the Checkout session id, with `stripe_subscription_id` set. Every event id is claimed once in `stripe_events`, so a Stripe retry of a finished event changes nothing.

| Event | Effect |
| --- | --- |
| `checkout.session.completed` (and the `async_payment_*` variants) | Re-reads the session line items and the Subscription from Stripe. The prices must be exactly the server-configured Prices, quantity 1 each, and the Subscription metadata must name the same offering. Inserts the row as `paid`, sets `paid_through` (trial end for the founding offer, period end for the monthly subscription), `subscription_status`, `price_locked_until`, and any scheduled cancel. Links the pending tool card. |
| `invoice.paid` | Moves `paid_through` forward to the invoice's latest line period end (each renewal adds a month), clears `payment_failed_at` and moves `past_due` back to `active` only when the paid event is at least as new as the recorded failure. An older invoice never moves `paid_through` back. A `canceled` row is final (a late `invoice.paid` changes nothing), and a scheduled cancel caps `paid_through` at `cancel_at`, also when `paid_through` was still empty. If no sponsor row matches yet (or it is a membership invoice) nothing changes; the checkout handler re-reads the Subscription when it runs. |
| `invoice.payment_failed` | Sets `payment_failed_at` (the event's created time) and moves `active`/`trialing` to `past_due`. It is ignored when its invoice period already ends on or before `paid_through` (a newer `invoice.paid` covered it), when it is older than the failure already recorded, or when the row is `canceled`. The card keeps showing until `paid_through`, then stops until a retry is paid. |
| `customer.subscription.created` / `updated` | Applies the status, a scheduled cancel (`cancel_at`, or the period end for `cancel_at_period_end`), and `canceled_at`. An event older than the last applied one is ignored, and a `canceled` row stays canceled. |
| `customer.subscription.deleted` | Sets `canceled`. If the subscription ended before `paid_through` (an immediate cancel), `paid_through` moves back to the end time and the card stops then. |

Placement window (`placementEndsAt` in `src/lib/best-placement.ts`): a subscription row shows from `paid_at` until `paid_through`. While Stripe reports it `active` or `trialing` with no cancel scheduled, the card keeps showing for up to 3 more days past `paid_through`, so the renewal invoice (usually paid within an hour of the period end) does not blink the card off. `past_due`, a scheduled cancel, and `canceled` get no grace.

Slot holds (`claimSponsorSlot`): a subscription that is renewing (`active`, `trialing`, or `past_due`, no cancel scheduled) holds its task page with no end date. After a cancel is scheduled, or once it is canceled, it holds the page until `paid_through`. A new subscription checkout is refused while any paid placement on that page has not ended.

Refunds: `charge.refunded` and `refund.*` set `refunded_at` once, which ends the placement and frees a founding spot. A one-time row matches on its payment intent. A subscription row has no payment intent stored (Checkout returns none for `mode=subscription`), so the handler looks up the invoice the refunded payment paid (the InvoicePayment for that payment intent) and matches the invoice's subscription. An invoice with no subscription (a one-off invoice) changes nothing. A refund with no invoice at all (for example a manual dashboard charge for a custom deal) is never matched on the customer: the webhook logs `unmatched sponsor refund, manual handling needed` (event type only, no PII) and changes nothing. Handle it by hand as in `docs/runbooks/sponsor-reject-refund.md`. A refund does not cancel the subscription: to stop billing, also cancel it in the dashboard. Any refund, including a partial or goodwill refund of one month, sets `refunded_at` and ends the placement for all later months while Stripe keeps billing; cancel the subscription too, or do not refund through Stripe if the placement should stay up.

## Schema

No new migration file. `adoptSponsorshipSchema` (run by `npm run db:migrate`, which the deploy prebuild runs) adds these nullable columns to `sponsorships` when they are missing, plus the index `sponsorships_subscription_idx` on `stripe_subscription_id`: `stripe_subscription_id`, `subscription_status`, `paid_through`, `price_locked_until`, `cancel_at`, `canceled_at`, `payment_failed_at`, `subscription_event_at`. Nothing is dropped or rewritten, and existing rows keep null in each new column.

## Environment

| Variable | Price |
| --- | --- |
| `STRIPE_PRICE_PLACEMENT_SUBSCRIPTION` | Recurring monthly $299, lookup key `sponsor_best_placement_monthly_recurring` |
| `STRIPE_PRICE_FOUNDING_MONTHLY` | Recurring monthly $299, lookup key `sponsor_founding_monthly` |
| `STRIPE_PRICE_FOUNDING_SETUP` | One-time $99, lookup key `sponsor_founding_first_two_weeks` |

The founding offer is available only when both founding variables are set. Each option is disabled on `/sponsor` until its Price ids are set. The live gate is unchanged: live checkout still needs the live gate in `src/lib/sponsor-checkout-gate.ts`, and test checkout still needs a test key.

Test mode: `npm run stripe:setup-test` with a test secret key creates or reuses all six sponsor Prices and prints the six `STRIPE_PRICE_*=price_...` lines. It still refuses live keys.

## Post-merge live steps (Mark approved live mode and the founding offer in writing on Oct 17, 2026)

Run these only after the PR is merged. They create three live Prices (with their Products) and add events to the live webhook. They do not delete or change any existing live object and do not rotate keys.

Load the live secret key from the vault into this shell without leaving it in history: run `read -rs STRIPE_LIVE_SECRET_KEY` and paste it at the hidden prompt. Do not `export` it; `api()` runs in the same shell, so curl and jq never need it in their environment. Do not paste it into chat, logs, or a file in the repo. Requires `curl` and `jq`.

```bash
set -euo pipefail
set -f  # no glob expansion, so a '*' event in $CURRENT or $REQUIRED stays literal
: "${STRIPE_LIVE_SECRET_KEY:?load the live secret key from the vault first}"
STRIPE_VERSION='2026-09-30.endive'
# The key reaches curl through a config read from process substitution, so it is
# not on the curl command line (not visible in ps) and is never written to disk.
stripe_auth() { printf 'user = "%s:"\n' "$STRIPE_LIVE_SECRET_KEY"; }
api() { curl -sS --fail-with-body --config <(stripe_auth) -H "Stripe-Version: ${STRIPE_VERSION}" "$@"; }

# Creates the Product and Price for one lookup key unless an active Price with that lookup key exists.
# An existing Price is reused only if its amount, currency, and interval match; otherwise the script aborts.
# Args: lookup_key offering unit_amount interval(month|one_time) nickname description
ensure_price() {
  local lookup="$1" offering="$2" amount="$3" interval="$4" nickname="$5" description="$6"
  local existing
  local found
  found=$(api -G https://api.stripe.com/v1/prices -d "lookup_keys[]=${lookup}" -d active=true)
  existing=$(printf '%s' "$found" | jq -r '.data[0].id // empty')
  if [ -n "$existing" ]; then
    if ! printf '%s' "$found" | jq -e --argjson amount "$amount" --arg interval "$interval" '
        .data[0] | .unit_amount == $amount and .currency == "usd"
        and (if $interval == "one_time" then .type == "one_time" and .recurring == null
             else .type == "recurring" and .recurring.interval == $interval and .recurring.interval_count == 1 end)' >/dev/null; then
      echo "ABORT: ${lookup} points at ${existing}, which does not match ${amount} usd ${interval}. Fix it by hand." >&2
      exit 1
    fi
    echo "${lookup} already exists and matches: ${existing}" >&2; echo "$existing"; return
  fi
  local product
  product=$(api https://api.stripe.com/v1/products \
    -H "Idempotency-Key: live-sponsor-product-${lookup}" \
    -d name=BestBotFor -d statement_descriptor=BestBotFor \
    --data-urlencode "description=${description}" \
    -d "metadata[offering]=${offering}" -d "metadata[lookup_key]=${lookup}" | jq -r .id)
  local recurring=()
  if [ "$interval" = month ]; then recurring=(-d "recurring[interval]=month" -d "recurring[interval_count]=1"); fi
  api https://api.stripe.com/v1/prices \
    -H "Idempotency-Key: live-sponsor-price-${lookup}-${amount}-${interval}" \
    -d "product=${product}" -d currency=usd -d "unit_amount=${amount}" \
    -d "lookup_key=${lookup}" -d transfer_lookup_key=true \
    --data-urlencode "nickname=${nickname}" -d "metadata[offering]=${offering}" \
    "${recurring[@]}" | jq -r .id
}

SUB=$(ensure_price sponsor_best_placement_monthly_recurring placement_subscription 29900 month \
  'Featured placement, monthly subscription' \
  'Featured placement, monthly subscription. Renews every month at $299 until you cancel. Cancel anytime; it ends at the close of the paid month.')
FOUNDING_MONTHLY=$(ensure_price sponsor_founding_monthly founding_sponsor 29900 month \
  'Founding sponsor, monthly' \
  'Founding sponsor, monthly. $99 today covers the first 2 weeks. Then $299 per month, renewing monthly. Founding price locked for 6 months. Cancel anytime.')
FOUNDING_SETUP=$(ensure_price sponsor_founding_first_two_weeks founding_sponsor 9900 one_time \
  'Founding sponsor, first 2 weeks' \
  'Founding sponsor, first 2 weeks. $99 today covers the first 2 weeks. Then $299 per month, renewing monthly. Founding price locked for 6 months. Cancel anytime.')
printf 'STRIPE_PRICE_PLACEMENT_SUBSCRIPTION=%s\nSTRIPE_PRICE_FOUNDING_MONTHLY=%s\nSTRIPE_PRICE_FOUNDING_SETUP=%s\n' "$SUB" "$FOUNDING_MONTHLY" "$FOUNDING_SETUP"

# Add the subscription events to the live webhook. enabled_events replaces the whole list,
# so the current events are read first and kept.
WE=we_1URwkHIJUbygfAucFVXA9X0z
CURRENT=$(api "https://api.stripe.com/v1/webhook_endpoints/${WE}" | jq -r '.enabled_events[]')
echo "current events: $(echo $CURRENT)"
if printf '%s\n' $CURRENT | grep -qx '\*'; then
  echo 'endpoint already receives every event; no change'
else
  REQUIRED='checkout.session.completed checkout.session.async_payment_succeeded checkout.session.async_payment_failed invoice.paid invoice.payment_failed customer.subscription.created customer.subscription.updated customer.subscription.deleted charge.refunded refund.created refund.updated'
  ARGS=()
  for event in $(printf '%s\n' $CURRENT $REQUIRED | sort -u); do ARGS+=(-d "enabled_events[]=${event}"); done
  api "https://api.stripe.com/v1/webhook_endpoints/${WE}" "${ARGS[@]}" | jq -r '.enabled_events | join(" ")'
fi
api "https://api.stripe.com/v1/webhook_endpoints/${WE}" | jq -r '"api_version=\(.api_version) status=\(.status) url=\(.url)"'
```

Then:

0. **Founding Payment Link cutover** (James, Oct 18). **Hard go-live condition: do not set `STRIPE_PRICE_FOUNDING_MONTHLY` or `STRIPE_PRICE_FOUNDING_SETUP` in Production until steps 1 to 5 of the cutover order below are all done: PR #88 (the gate that hides the founding Payment Link once the founding Prices are configured) merged and deployed to production; the founding Payment Link `plink_1URylT…` deactivated in the Stripe dashboard (0(a)); every founding link sale's `founding_link:` row confirmed (0(b)); the preview test-mode run passed (a founding checkout charges $99 on the first invoice with a 14-day trial, then $299/mo, with the real `invoice.paid` payload); and James's go-live OK.** **Cutover order (James, Oct 18), in exactly this order:** 1. #88 merged and deployed to production. 2. The founding Payment Link `plink_1URylT…` deactivated in the Stripe dashboard by Mark or with his OK (never by API). 3. Every completed founding link sale confirmed to have its `founding_link:` row. 4. The preview test-mode run passed. 5. James gives the go-live OK. 6. Only then set BOTH `STRIPE_PRICE_FOUNDING_SETUP` and `STRIPE_PRICE_FOUNDING_MONTHLY` in Production. The (a) to (c) below implement steps 2, 3 and 6. Until this step, the live founding Payment Link `plink_1URylT…` stays active and is the only founding path; `/sponsor` keeps pointing at it. At go-live of these founding Prices, in this order: (a) in the Stripe dashboard, deactivate the founding Payment Link (Payment Links, the founding link, Deactivate). This is a dashboard action by Mark or with his OK; nothing in this runbook does it by API. (b) Confirm every completed founding Payment Link sale has its manual `founding_link:` row (sponsor-reject-refund runbook, Fulfillment step 5), so the app's shared count of 5 already includes them. (c) Then do steps 1 to 3. There is no manual call-to-action switch: #88 hides the founding Payment Link on `/sponsor` automatically once both founding Prices are set. Existing Payment Link founders keep their subscriptions and stay manual rows.
1. Add the printed values to Vercel **Production** as sensitive variables and redeploy production so the server reads them. `STRIPE_PRICE_PLACEMENT_SUBSCRIPTION` can go in on its own. The two founding variables, `STRIPE_PRICE_FOUNDING_MONTHLY` and `STRIPE_PRICE_FOUNDING_SETUP`, go in only after the hard go-live condition in step 0 is met (#88 merged and deployed, the founding Payment Link deactivated, the founding_link rows confirmed, the preview test-mode run passed, and James's go-live OK). If both founding variables are set before then, live `/sponsor` hides the Payment Link and enables the in-app founding offer while the link may still be active, so both founding paths can sell. (With only one set, the in-app option stays disabled and only the Payment Link shows.)
2. Read-only check after the deploy: `PRAGMA table_info(sponsorships)` lists the eight new columns, and `sponsorships_subscription_idx` exists. Existing rows are unchanged.
3. Open `https://bestbotfor.com/sponsor`: the founding and monthly subscription options are enabled, the founding line reads "$99 for 2 weeks, then $299/mo", and the one-time options are unchanged. Also confirm `STRIPE_PRICE_FOUNDING_SETUP` and `STRIPE_PRICE_FOUNDING_MONTHLY` in Production are exactly the live ids printed by the `ensure_price` read-back above (`FOUNDING_SETUP`, `FOUNDING_MONTHLY`), and that the two values differ. The #88 gate only checks the `price_…` format: a test-mode, nonexistent, or duplicated id still hides the Payment Link and enables a founding option that then fails at Checkout (no money moves, but the offer is unbuyable). Sell-out hiding of the Founding card after the 5th sale is still open from #84 (see sponsor-payment-links.md); until it ships, the live payment watch covers a 6th founding sale.
4. In the Stripe dashboard (Billing, Subscriptions and emails), turn on trial-ending reminders, Smart Retries for failed payments, and emails about failed payments and expiring cards.
5. Optional live smoke test: buy the founding offer once with a real card, confirm the webhook delivery returns 200 for `checkout.session.completed` and `invoice.paid`, confirm the row shows `subscription_status=trialing` and `paid_through` 14 days out, then refund the $99 invoice payment and cancel the subscription immediately, and confirm `customer.subscription.deleted` returns 200.

Webhook time budget: the handler's database work has a 2-second budget (`WEBHOOK_DB_BUDGET_MS`), and subscription events now make 2 to 3 Stripe reads inside it (session plus subscription, or InvoicePayment plus invoice). On a slow Stripe response the webhook returns 500 and Stripe retries. That is safe, because every event is applied once, but expect occasional retried deliveries in the payment watch; they are not failures unless they keep failing.

The endpoint's `api_version` decides the invoice payload shape. The handler reads the subscription id from `parent.subscription_details.subscription` (current versions) and falls back to `subscription` (older versions), so either works.

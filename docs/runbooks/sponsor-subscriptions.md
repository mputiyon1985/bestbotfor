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
- **Cancellation.** There is no customer portal in this app. A sponsor asks by email (mark@bestbotfor.com), and the cancellation is made in the Stripe dashboard with **Cancel at end of period**. The placement then runs to the end of the paid month and stops.
- **5 founding sponsors.** `claimSponsorSlot` refuses a founding checkout once 5 spots are in use: paid, unrefunded founding rows (a canceled founding sponsor still counts, so there are only ever 5) plus founding checkout holds younger than 24 hours whose page has no paid founding row yet. The count and the hold are one SQL statement, so two buyers cannot both take the last spot. A refund (`refunded_at`) frees the spot. The buyer sees "All 5 founding sponsor spots are taken. Choose another option." The standard $299/mo subscription is not capped.
- **Which page.** Every placement, including both subscriptions, requires "Which /best page do you want to sponsor?" (`task_slug`). The server refuses a placement without a valid page.

## Membership checkout status fix

`checkout.session.completed` for a membership subscription used to write `subscriptions.status = 'incomplete'` on every run. When it was processed after `customer.subscription.created`, it set a `trialing` or `active` membership back to `incomplete`. It now only seeds `incomplete` on a new row and leaves an existing status alone. `checkout.session.async_payment_succeeded` only moves a new or `incomplete` row to `active`. `customer.subscription.*` still always sets the status.

## How fulfillment works

The webhook (`src/lib/stripe-webhook.ts`) keeps one `sponsorships` row per subscription, keyed by the Checkout session id, with `stripe_subscription_id` set. Every event id is claimed once in `stripe_events`, so a Stripe retry of a finished event changes nothing.

| Event | Effect |
| --- | --- |
| `checkout.session.completed` (and the `async_payment_*` variants) | Re-reads the session line items and the Subscription from Stripe. The prices must be exactly the server-configured Prices, quantity 1 each, and the Subscription metadata must name the same offering. Inserts the row as `paid`, sets `paid_through` (trial end for the founding offer, period end for the monthly subscription), `subscription_status`, `price_locked_until`, and any scheduled cancel. Links the pending tool card. |
| `invoice.paid` | Moves `paid_through` forward to the invoice's latest line period end (each renewal adds a month), clears `payment_failed_at`, and moves `past_due` back to `active`. An older invoice never moves `paid_through` back. If no sponsor row matches yet (or it is a membership invoice) nothing changes; the checkout handler re-reads the Subscription when it runs. |
| `invoice.payment_failed` | Sets `payment_failed_at` and moves `active`/`trialing` to `past_due`. The card keeps showing until `paid_through`, then stops until a retry is paid. |
| `customer.subscription.created` / `updated` | Applies the status, a scheduled cancel (`cancel_at`, or the period end for `cancel_at_period_end`), and `canceled_at`. An event older than the last applied one is ignored, and a `canceled` row stays canceled. |
| `customer.subscription.deleted` | Sets `canceled`. If the subscription ended before `paid_through` (an immediate cancel), `paid_through` moves back to the end time and the card stops then. |

Placement window (`placementEndsAt` in `src/lib/best-placement.ts`): a subscription row shows from `paid_at` until `paid_through`. While Stripe reports it `active` or `trialing` with no cancel scheduled, the card keeps showing for up to 3 more days past `paid_through`, so the renewal invoice (usually paid within an hour of the period end) does not blink the card off. `past_due`, a scheduled cancel, and `canceled` get no grace.

Slot holds (`claimSponsorSlot`): a subscription that is renewing (`active`, `trialing`, or `past_due`, no cancel scheduled) holds its task page with no end date. After a cancel is scheduled, or once it is canceled, it holds the page until `paid_through`. A new subscription checkout is refused while any paid placement on that page has not ended.

Refunds: the existing refund events match a one-time payment intent. A subscription row has no payment intent stored. To refund a sponsor subscription, refund the invoice payment in the dashboard **and** cancel the subscription immediately; the `customer.subscription.deleted` event ends the placement.

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

Load the live secret key from the vault into the shell environment. Do not paste it into chat, logs, or a file in the repo. Requires `curl` and `jq`.

```bash
set -euo pipefail
: "${STRIPE_LIVE_SECRET_KEY:?load the live secret key from the vault first}"
STRIPE_VERSION='2026-09-30.endive'
# The key reaches curl through a config read from process substitution, so it is
# not on the curl command line (not visible in ps) and is never written to disk.
stripe_auth() { printf 'user = "%s:"\n' "$STRIPE_LIVE_SECRET_KEY"; }
api() { curl -sS --fail-with-body --config <(stripe_auth) -H "Stripe-Version: ${STRIPE_VERSION}" "$@"; }

# Creates the Product and Price for one lookup key unless an active Price with that lookup key exists.
# Args: lookup_key offering unit_amount interval(month|one_time) nickname description
ensure_price() {
  local lookup="$1" offering="$2" amount="$3" interval="$4" nickname="$5" description="$6"
  local existing
  existing=$(api -G https://api.stripe.com/v1/prices -d "lookup_keys[]=${lookup}" -d active=true | jq -r '.data[0].id // empty')
  if [ -n "$existing" ]; then echo "${lookup} already exists: ${existing}" >&2; echo "$existing"; return; fi
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

1. Add the three printed values to Vercel **Production** as sensitive variables `STRIPE_PRICE_PLACEMENT_SUBSCRIPTION`, `STRIPE_PRICE_FOUNDING_MONTHLY`, `STRIPE_PRICE_FOUNDING_SETUP`, and redeploy production so the server reads them.
2. Read-only check after the deploy: `PRAGMA table_info(sponsorships)` lists the eight new columns, and `sponsorships_subscription_idx` exists. Existing rows are unchanged.
3. Open `https://bestbotfor.com/sponsor`: the founding and monthly subscription options are enabled, the founding line reads "$99 for 2 weeks, then $299/mo", and the one-time options are unchanged.
4. In the Stripe dashboard (Billing, Subscriptions and emails), turn on trial-ending reminders, Smart Retries for failed payments, and emails about failed payments and expiring cards.
5. Optional live smoke test: buy the founding offer once with a real card, confirm the webhook delivery returns 200 for `checkout.session.completed` and `invoice.paid`, confirm the row shows `subscription_status=trialing` and `paid_through` 14 days out, then refund the $99 invoice payment and cancel the subscription immediately, and confirm `customer.subscription.deleted` returns 200.

The endpoint's `api_version` decides the invoice payload shape. The handler reads the subscription id from `parent.subscription_details.subscription` (current versions) and falls back to `subscription` (older versions), so either works.

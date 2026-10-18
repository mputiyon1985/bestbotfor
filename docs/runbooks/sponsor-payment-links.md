# Sponsor Payment Links

The live `/sponsor` page links two Stripe Payment Links (`src/lib/sponsor-payment-links.ts`). They show only when live billing is on (`VERCEL_ENV` exactly `production`, `STRIPE_ALLOW_LIVE` exactly `true`, and a live key). Fulfillment, refunds, the price lock, and disputes for these sales are in `docs/runbooks/sponsor-reject-refund.md`, "Payment Link sales".

## Live configuration read-back (2026-10-18, 3:59:23 PM EDT)

Read-only `GET /v1/payment_links/{id}` with `expand[]=line_items.data.price`, account `acct_1URAHjIJUbygfAuc`, live key read from a file (never on a command line). No update was sent.

| Check | Founding `plink_1URylTIJUbygfAuc07cebXfn` | Monthly `plink_1URyeXIJUbygfAucnLlkSP5u` |
|---|---|---|
| `livemode` / `active` | `true` / `true` | `true` / `true` |
| `url` | `https://buy.stripe.com/fZudRabMce0q5BoebyfrW04`, equal to the code | `https://buy.stripe.com/4gMdRa7vW8G6gg2ebyfrW02`, equal to the code |
| Line items | `price_1URydxIJUbygfAucYoEgdmVJ` recurring, 29900 usd, `month`/1, qty 1; plus `price_1URydxIJUbygfAucGkbOAOpq` one-time, 9900 usd, qty 1 ("first 2 weeks") | `price_1URydyIJUbygfAucBva71dNR` recurring, 29900 usd, `month`/1, qty 1 |
| $99 first 2 weeks | `subscription_data.trial_period_days` 14: the $99 one-time item is charged today and the $299/mo price starts after 14 days | n/a (`trial_period_days` null) |
| `restrictions.completed_sessions` | `limit` 5, `count` 0 | `null` (uncapped) |
| `best_page` custom field | text, `optional: false` (required) | text, `optional: false` (required) |
| `metadata` | `offer=founding_sponsor`, `source=payment_link` | `offer=sponsor_monthly`, `source=payment_link` |
| `subscription_data.metadata` | `offer=founding_sponsor`, `source=payment_link` | `offer=sponsor_monthly`, `source=payment_link` |
| No `kind=sponsorship`, no `clerkUserId` | Yes, neither key in either metadata | Yes, neither key in either metadata |
| Billing address | required | required |

Without `kind=sponsorship` the webhook does not treat these sales as sponsorships (it would otherwise throw on the unknown offering and Stripe would retry the 500). Without `clerkUserId` their `subscriptions` row grants no membership.

The founding link's Stripe copy (custom submit text and subscription description) still says "Founding price locked for 6 months". `/sponsor` now says "Price locked at $299/mo for 6 months." Both mean the same $299 price; the Stripe text cannot change without replacing the link, so it stays.

Repeat this read-back whenever a link, its Prices, or its copy changes, and update `src/lib/sponsor-payment-links.ts` in the same change: the page prices are copy, not read from Stripe.

## One founding cap of 5 (James, 2026-10-18)

There is ONE founding cap of 5, shared by the Founding Payment Link and the in-app founding offer from #81. It is not 5 per path.

- Until #81's founding Prices go live, the Founding Payment Link stays live and is the only founding path. Its Stripe `completed_sessions.limit` of 5 is the cap.
- #81's founding count must include every founding sponsorship row, including the manual rows created from Payment Link sales (the `founding_link:` prefix on `stripe_checkout_session_id`, see the refund runbook, Fulfillment step 5).
- At go-live of #81's founding Prices, in one release window:
  1. Read back the Founding link again and note `restrictions.completed_sessions.count`.
  2. Confirm every completed Founding link sale has its manual `founding_link:` row, so the app's count already includes them.
  3. Deactivate the Founding Payment Link in the Stripe dashboard. That is a live Stripe change by Mark or with his OK, never by API from this repo.
  4. In the same deploy, switch `/sponsor` from the Founding Payment Link to #81's in-app founding offer.
  Founders already sold through the link keep their Stripe subscriptions, price lock, and manual rows.
- The Monthly link is not part of the founding cap. Whether it stays next to #81's in-app monthly subscription is decided when #81 lands.

When the 5th founding sale completes, Stripe deactivates the Founding link and the `/sponsor` card stays up until a code change hides it (Sentinel P3-1 on #84, not done). A session opened before the 5th completes can still finish, so the payment watch should check for a 6th founding sale and refund it.

## Cancelling

There is no customer portal. Live `/sponsor` says "To cancel, email mark@bestbotfor.com" under the subscriptions. Cancel in the Stripe dashboard with **Cancel at end of period**; see the refund runbook, "Refunds and cancellations".

## Disclosure

The subscriptions section says "Placements carry a Sponsored label and never change rankings. See Disclosures." and links `/disclosure`. A Payment Link placement is published only through a `sponsorships` row and an approved card, so it carries that label.

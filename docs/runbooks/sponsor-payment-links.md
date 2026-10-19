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

- Go-live of the in-app founding Prices has ONE procedure: `sponsor-subscriptions.md`, "Post-merge live steps", step 0. Follow it exactly; this section does not repeat it. In short: the founding Payment Link `plink_1URylT…` is deactivated in the Stripe dashboard first (0(a), by Mark or with his OK, never by API), and only AFTER that are the `founding_link:` rows confirmed (0(b)), so a link sale cannot land between the check and the deactivation.
- **Cutover order (James, Oct 18), in exactly this order:** 1. #88 merged and deployed to production. 2. Deactivate the Founding Payment Link in the Stripe dashboard (`plink_1URylT…`), by Mark or with his OK (never by API). 3. Every completed founding link sale confirmed to have its `founding_link:` row. 4. The preview test-mode run passed. 5. James gives the go-live OK. 6. Only then set BOTH `STRIPE_PRICE_FOUNDING_SETUP` and `STRIPE_PRICE_FOUNDING_MONTHLY` in Production. Rows are checked only AFTER the link is deactivated.
- #88 hides the Founding Payment Link on `/sponsor` automatically once BOTH founding Price variables are set to valid ids (the same check that enables the in-app founding option). No manual CTA switch is needed.
- Count rule: the app's shared count of 5 includes paid, unrefunded in-app founding rows plus Payment Link sales, where a link sale counts only through its first-period row (`founding_link:<cs_…>`) and only while that row is unrefunded. Later-period rows (`founding_link:<cs_…>:<in_…>`) do not add to the count. See the refund runbook, Fulfillment step 5.
- Founders already sold through the link keep their Stripe subscriptions, price lock, and manual rows.
- The Monthly link is not part of the founding cap.

**Sold-out auto-hide (Sentinel P3-1 on #84, shipped; Mark approved building it on 2026-10-19).** Once the shared count reaches 5, live `/sponsor` renders the in-app founding option disabled and labeled "Founding sponsor · Sold out" with "All founding sponsor spots are taken.", and the price list line reads "Founding sponsor: Sold out. All 5 founding sponsor spots are taken." No founding price or terms are shown while sold out, and the Founding Payment Link card stays hidden (it is hidden whenever the founding Prices are set). The checkout server action refuses a new founding session with "All 5 founding sponsor spots are taken. Choose another option." before any Stripe call. Details, the race guard, and the refund rule are in `sponsor-subscriptions.md`, "Founding sold out". The Founding Payment Link has been inactive since the 2026-10-19 go-live, so a link session can no longer add a sixth founder; keep the live payment watch on for the webhook-completion edge case described there.

## Founding go-live record (2026-10-19)

- Approval: Mark directly approved the founding go-live at 8:49 PM ET on 2026-10-18.
- 0(a): the Founding Payment Link `plink_1URylTIJUbygfAuc07cebXfn` (…fZudRabMce0q5BoebyfrW04) and the two other founding links (`plink_1URyevIJUbygfAuc7BjAxQtg`, `plink_1URyeXIJUbygfAucLVGvitJK`) are inactive (live API read-back, 2026-10-19). The founding link had 0 completed sessions of its limit of 5.
- 0(b): a read-only SELECT on the production database returned 0 `founding_link:` rows and 0 sponsorships; live Stripe had 0 charges.
- Step 1: `STRIPE_PRICE_FOUNDING_SETUP` = `price_1URydxIJUbygfAucGkbOAOpq` ($99 one-time, live, active) and `STRIPE_PRICE_FOUNDING_MONTHLY` = `price_1URydxIJUbygfAucYoEgdmVJ` ($299/mo recurring, live, active) were set as Sensitive, Production only, at about 5:53 AM ET on 2026-10-19. They are the live founding link's own line-item Prices. They have no `lookup_key`, so the `ensure_price` lookup in `sponsor-subscriptions.md` does not find them; the app matches by Price id only. The 14-day trial comes from the app's Checkout (`FOUNDING_TRIAL_DAYS`), not from the Price.
- Step 2: production redeployed from main `0aa9c0c` as `dpl_7m5jB9YuxbaNdmNZrkQVGWEpSBvL`, ready 5:54 AM ET.
- Step 3 verify (read-only): `/sponsor` live mode with the founding option enabled, the founding line "$99 for 2 weeks, then $299/mo", the Founding Payment Link card hidden; HTML and client chunks free of `priceEnv`, `STRIPE_PRICE_` and both Price ids; an unsigned webhook POST returned 400 `invalid-signature`; no 5xx; 0 live charges.

## Cancelling

There is no customer portal. Live `/sponsor` says "To cancel, email mark@bestbotfor.com" under the subscriptions. Cancel in the Stripe dashboard with **Cancel at end of period**; see the refund runbook, "Refunds and cancellations".

## Disclosure

The subscriptions section says "Placements carry a Sponsored label and never change rankings. See Disclosures." and links `/disclosure`. A Payment Link placement is published only through a `sponsorships` row and an approved card, so it carries that label.

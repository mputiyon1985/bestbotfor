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

**Sold-out auto-hide (Sentinel P3-1 on #84, shipped; Mark approved building it on 2026-10-19).** Once the shared count reaches 5, live `/sponsor` renders the in-app founding option disabled and labeled "Founding sponsor · Sold out" with "All founding sponsor spots are taken.", and the price list line reads "Founding sponsor: Sold out. All 5 founding sponsor spots are taken." No founding price or terms are shown while sold out, and there is no Founding Payment Link card (retired from the code, below). The checkout server action refuses a new founding session with "All 5 founding sponsor spots are taken. Choose another option." before any Stripe call. Details, the race guard, and the refund rule are in `sponsor-subscriptions.md`, "Founding sold out". The Founding Payment Link has been inactive since the 2026-10-19 go-live, so a link session can no longer add a sixth founder; keep the live payment watch on for the webhook-completion edge case described there.

**Founding Payment Link retired from the code (Sentinel P3-6 on #97).** `plink_1URylTIJUbygfAuc07cebXfn` has been inactive in Stripe since the 2026-10-19 go-live, and it is no longer in `SPONSOR_PAYMENT_LINKS` (`src/lib/sponsor-payment-links.ts`); only the Monthly link remains. Before this, #88 showed the founding link card whenever the founding Price variables were not both set, so a rollback (unsetting them in Production) would have put a dead buy.stripe.com button back on live `/sponsor`. Now a rollback shows the in-app founding option as not configured and no founding link. Past link sales still count through their `founding_link:` rows. To sell founding through a link again, add a new active link to that list in a reviewed change; never reactivate the old one without updating the code. The read-back table above is kept as the record of that link.

## Founding go-live record (2026-10-19)

- Approval: Mark directly approved the founding go-live at 8:49 PM ET on 2026-10-18.
- 0(a): the Founding Payment Link `plink_1URylTIJUbygfAuc07cebXfn` (…fZudRabMce0q5BoebyfrW04) and the two other founding links (`plink_1URyevIJUbygfAuc7BjAxQtg`, `plink_1URyeXIJUbygfAucLVGvitJK`) are inactive (live API read-back, 2026-10-19). The founding link had 0 completed sessions of its limit of 5.
- 0(b): a read-only SELECT on the production database returned 0 `founding_link:` rows and 0 sponsorships; live Stripe had 0 charges.
- Step 1: `STRIPE_PRICE_FOUNDING_SETUP` = `price_1URydxIJUbygfAucGkbOAOpq` ($99 one-time, live, active) and `STRIPE_PRICE_FOUNDING_MONTHLY` = `price_1URydxIJUbygfAucYoEgdmVJ` ($299/mo recurring, live, active) were set as Sensitive, Production only, at about 5:53 AM ET on 2026-10-19. They are the live founding link's own line-item Prices. They have no `lookup_key`, so the `ensure_price` lookup in `sponsor-subscriptions.md` does not find them; the app matches by Price id only. The 14-day trial comes from the app's Checkout (`FOUNDING_TRIAL_DAYS`), not from the Price.
- Price read-back (live API, 2026-10-19): setup `price_1URydxIJUbygfAucGkbOAOpq` is 9900 usd one-time on `prod_VSuSq6ias4d6ef` ("BestBotFor Founding Sponsor - first 2 weeks"), metadata `offer=founding_sponsor_setup`; monthly `price_1URydxIJUbygfAucYoEgdmVJ` is 29900 usd recurring month ×1 on `prod_VSuS00dvmynpKU` ("BestBotFor Founding Sponsor"), metadata `offer=founding_sponsor`. Both livemode, active, and distinct. No founding variable existed in any environment before; afterwards `vercel env ls` shows exactly the two, both Sensitive, Production only. Do not run `ensure_price` for founding against live (it would create duplicates); `sponsor-subscriptions.md` step 3 checks these ids instead.
- Step 2: production redeployed (`vercel redeploy dpl_Fy7LA3zPaDQXh2Kjhz441G1NEe5c --target production`) from main `0aa9c0c` as `dpl_7m5jB9YuxbaNdmNZrkQVGWEpSBvL`, created 5:54:11 AM ET, ready 5:54:49 AM ET, aliased to bestbotfor.com, www.bestbotfor.com and bestbotfor.vercel.app.
- Step 3 verify (read-only): `/sponsor` live mode with the founding option enabled, the founding line "$99 for 2 weeks, then $299/mo", the Founding Payment Link card hidden; HTML and client chunks free of `priceEnv`, `STRIPE_PRICE_` and both Price ids; an unsigned webhook POST returned 400 `invalid-signature`; the live endpoint `we_1URwkHIJUbygfAucFVXA9X0z` is enabled on `https://bestbotfor.com/api/stripe/webhook` with 16 events including `invoice.paid`; the deployment's logs had no 5xx and no warnings (the only error line was the verifier's own signed-out cron probe, 401 by design); 0 live charges and 0 Checkout sessions since 8:00 PM ET 2026-10-18; the production DB after the deploy had 0 sponsorships, 0 `founding_link:` rows, 0 webhook events and 23 `schema_migrations` rows. `placement_subscription` stays disabled because `STRIPE_PRICE_PLACEMENT_SUBSCRIPTION` is not set. Still active in Stripe and expected: the Monthly link `plink_1URyeXIJUbygfAucnLlkSP5u` and a $1 smoke-test link that is not on the site.

## Cancelling

There is no customer portal. Live `/sponsor` says "To cancel, email mark@bestbotfor.com" under the subscriptions. Cancel in the Stripe dashboard with **Cancel at end of period**; see the refund runbook, "Refunds and cancellations".

## Disclosure

The subscriptions section says "Placements carry a Sponsored label and never change rankings. See Disclosures." and links `/disclosure`. A Payment Link placement is published only through a `sponsorships` row and an approved card, so it carries that label.

## Abandoned checkout recovery

`/sponsor` creates Checkout Sessions in code (`src/lib/sponsor-checkout.ts`). Recovery is off for founding and for every `/best` placement. A recovered session stays payable for 30 days and does not recreate the founding hold or the page slot claim, so it can oversell the cap of 5 or double-book a page. The allowlist is `SPONSOR_RECOVERY_OFFERING_IDS` in that file. Today it contains only `newsletter_slot`, which has no cap and no page slot. Flip an id into that list only when a recovered payment cannot take a scarce spot.

Where recovery is on, the session sets `after_expiration.recovery.enabled` to true, `allow_promotion_codes` to false, and `consent_collection.promotions` to `auto`. That last field is the checkbox setting. It is not the buyer's consent. The buyer's answer on the expired session is `consent.promotions`, and the only value we store is `opt_in`.

A Payment Link cannot set `after_expiration` on the Checkout Session it opens. The Payment Links API has no such parameter. The Monthly link is `plink_1URyeXIJUbygfAucnLlkSP5u` ($299/mo). The founding link `plink_1URylTIJUbygfAuc07cebXfn` is retired. Do not reactivate it.

`checkout.session.expired` stores a row in `sponsor_abandoned_checkouts` only when `consent.promotions` is `opt_in`. The row is the email, the offer, the expiry time, the Checkout Session id, the task when we have one, `promotions_consent` (`opt_in`), and `consented_at` (the expiry event time; Stripe does not send a separate consent clock). Anyone who did not opt in is not stored. A Payment Link session is stored only when its `payment_link` id is one this app knows (`plink_1URyeXIJUbygfAucnLlkSP5u` or the retired founding link) and the metadata offer does not disagree. A paid session is not stored. A membership session is not stored. A second delivery of the same session does not add a row.

Follow-up is one manual email about the unfinished checkout, and only when `consent.promotions` is `opt_in` (the row's `promotions_consent` is `opt_in`). The app does not send that email. Without that opt-in there is no follow-up email.

The existing data-retention cron deletes a row about 90 days after `expired_at`. No new cron was added. The purge does not write in production while `DATA_RETENTION_PRODUCTION_LAUNCH` is `false`. That constant lives in `src/lib/retention-flags.ts`. It is not an environment variable, and this change leaves it `false`. Turning the production purge on is Mark's call. Production writes only when all four of these are set:

- `DATA_RETENTION_PRODUCTION_LAUNCH` is `true` (the code constant above; it ships `false`)
- `CRON_SECRET` is set, at least 32 characters, and sent as `Authorization: Bearer …` on `GET /api/cron/data-retention`
- `DATA_RETENTION_PURGE` is exactly `on`
- `DATA_RETENTION_DRY_RUN` is exactly `off`

`/admin/sponsors` lists the opted-in rows when the sponsor admin flag is on. In production that page stays 404 until that flag's launch. Until then:

```sql
SELECT email, offering, expired_at, task_slug, source, promotions_consent, consented_at, stripe_checkout_session_id
FROM sponsor_abandoned_checkouts
ORDER BY expired_at DESC;
```

Refer to a row by its `cs_…` id. Do not paste the buyer's email into Slack, chat, tickets, or the repo.

A paid founding checkout that takes the count past 5, or a paid placement that lands on a page that already has an active placement, is kept, logged (`FOUNDING CAP EXCEEDED` or `PLACEMENT SLOT TAKEN`), and shown on `/admin/sponsors`. A paid `newsletter_slot` whose `issue_date` is before the UTC day of the webhook is kept, logged (`NEWSLETTER ISSUE PASSED`), and shown there too. A recovered newsletter Checkout can stay payable for 30 days, so that check runs at completion. Nothing is refunded automatically.

### Refunds and cancellations for those rows

Do not approve the tool card until Mark decides to refund or honor the sale. The app does not call the Stripe refund API.

1. Find the payment in the Stripe dashboard from the `cs_…` on the admin row. A subscription Checkout has no payment intent of its own, so take the `pi_…` from that period's invoice payment.
2. To refund, refund that payment in the Stripe dashboard. A succeeded refund, including a partial refund, sets `refunded_at` on the matching `sponsorships` row and hides the placement. See `docs/runbooks/sponsor-reject-refund.md`.
3. To stop future charges on a founding or placement subscription, cancel in the Stripe dashboard with **Cancel at end of period**. Canceling stops later invoices. The current period stays until its window ends unless you also refund. There is no customer portal. Live `/sponsor` says "To cancel, email mark@bestbotfor.com".

### Dashboard settings (not applied; needs Mark's OK)

Do this in the Stripe Dashboard, live mode. Do not call the API from this repo.

1. Developers → Webhooks → endpoint `we_1URwkHIJUbygfAucFVXA9X0z` (`https://bestbotfor.com/api/stripe/webhook`). Add `checkout.session.expired`. Keep every event the endpoint already sends. Saving replaces the event list, so copy the current events first and add this one to them.
2. Payment Links → open `plink_1URyeXIJUbygfAucnLlkSP5u` (Monthly, `https://buy.stripe.com/4gMdRa7vW8G6gg2ebyfrW02`). Edit it and turn on the promotional-email checkbox (`consent_collection.promotions` = `auto`). Leave promotion codes off. There is no control on a Payment Link for `after_expiration.recovery`. A buyer is stored only after they opt in.
3. Leave `plink_1URylTIJUbygfAuc07cebXfn` inactive.

The unpaid $299 Sponsor Monthly session that expired on Nov 1, 2026 cannot be recovered by this change. Recovery is chosen when the session is created, and that session has already expired. Payment Links cannot set it per session. Future expired Monthly sessions are recorded once step 1 is live and only when the buyer opted in. One manual follow-up email is allowed for those opted-in buyers, and for no one else. In-app founding and placement checkouts do not turn recovery on.

# Membership pricing: live Stripe plan (Oct 21, 2026)

Mark approved the live prices, coupon and Production env vars on Oct 21, 2026 at 7:46 AM ET (via the parent chat).
**Not applied yet.** Apply only after reviewer + Sentinel PASS and an explicit go from the parent. Nothing below has been created in live mode.

## Live Stripe objects (create once, in this order)
1. Product: `BestBotFor Membership`, metadata `bbf_key=bbf_membership`.
2. Price (annual): USD 2900 (`$29.00`), recurring `interval=year`, lookup_key `bbf_member_annual_2900`.
3. Price (monthly): USD 400 (`$4.00`), recurring `interval=month`, lookup_key `bbf_member_monthly_400`.
4. Coupon: id `bbf_founding_19_first_year`, name `Founding member: $19 first year`, `amount_off=1000`, `currency=usd`, `duration=once`, `max_redemptions=100`, `applies_to.products=[<live product id>]`. The app attaches it to annual checkouts only ($29 - $10 = $19 for year one, then $29/yr).

No trial on either price. No promotion codes. Checkout sets `managed_payments.enabled=false` (same as sponsor checkout).

## Production env vars (Vercel, Production only)
| Name | Value |
|---|---|
| `STRIPE_PRICE_MEMBER_ANNUAL` | live annual price id (`price_...`) from step 2 |
| `STRIPE_PRICE_MEMBER_MONTHLY` | live monthly price id (`price_...`) from step 3 |
| `STRIPE_COUPON_FOUNDING` | `bbf_founding_19_first_year` |

These IDs also unlock /deals (PR #120) once that merges; `DEALS_MEMBER_PRICE_IDS` can stay unset.

## Prerequisites the live page needs (already-existing gates, unchanged by this PR)
- Live keys work only when `VERCEL_ENV=production` and `STRIPE_ALLOW_LIVE` set to the string true (plus live `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`). If those are not set, /pricing keeps showing "coming soon" or "temporarily unavailable"; nothing is sold.
- `scripts/setup-membership-stripe.ts` refuses live keys by design; create the live objects in the Dashboard or with a one-off reviewed command.

## Verify after applying
- /pricing shows `$29/yr, about $2.42/mo`, the founding line, `$4/mo`, and the 14-day guarantee; no test-mode note.
- One real annual checkout shows `$19.00` due today, then refund it.

## Rollback
Remove the three env vars and redeploy: /pricing falls back to "coming soon". Archive the prices and delete the coupon if needed.

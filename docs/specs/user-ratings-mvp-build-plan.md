# A18 launch gates

Status for the user-ratings launch gates. The feature stays off in production until every gate below is met and the launch PR sets `USER_RATINGS_PRODUCTION_LAUNCH` to true.

Recorded October 17, 2026.

## Gates (all required before PR A18 merges)

1. **Lawyer review signed off (D13). Done.** James recorded Mark's approval on October 17, 2026 at 10:46 AM ET. `/privacy`, `/terms`, and `/disclosure` index normally in production: same `index, follow` robots as the rest of the public site, listed in the sitemap, and not disallowed in `robots.txt`. `/review-guidelines` and `/how-user-ratings-work` stay `noindex, nofollow` until ratings launch. This gate does not turn ratings on. `USER_RATINGS_PRODUCTION_LAUNCH` and `POLICY_PAGES_LAWYER_APPROVED` stay false.
2. **Mark approves** the final copy and the A18 PR. Open.
3. **Sentinel signs off** on A17 (T1–T26 and every row of spec 11.1 and 11.2, axe, Lighthouse, headers, the cache test, the production-mode and flag-on tests). Open.
4. **Ops ready:** `CLERK_WEBHOOK_SIGNING_SECRET`, `ADMIN_CLERK_USER_IDS` and `REVIEW_STAFF_USER_IDS` set per environment; `RATE_LIMIT_HMAC_SECRET` set in Production and Preview (at least 32 bytes in Production); `REVIEW_IP_HMAC_SECRET` (at least 32 bytes) and `REVIEW_IP_HMAC_KEY_ID` set and checked in Production and Preview; CI running; PR #28 merged; Mark and James have the Clerk admin role and MFA enrolled. Open.
5. **Rollback documented** in the A18 PR (revert the constant). Open.

Until gates 2–5 are met, production shows no user ratings.

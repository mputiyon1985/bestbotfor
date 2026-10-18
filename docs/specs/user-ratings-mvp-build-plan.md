# User Ratings: MVP Build Plan for Tony

**For:** Tony (developer) · **Reviewers:** Sentinel (QA and security), Mark Putiyon (approver), James (CEO)  
**Spec:** `specs/user-ratings-spec.md`, **Approved, v1.2.1.** Mark approved v1.0 on 2026-10-17 at 2:44 AM ET. v1.1 (2026-10-17) adds the sitewide "Our rating" rename (D14) and Sentinel's security hardening (spec 11.1). v1.2 (2026-10-17) adds security hardening from Sentinel's review of v1.1 (spec 11.2). It changes none of Mark's decisions, so no new sign-off is needed. v1.2.1 (2026-10-17) is a security patch to A1b's secret checks, also with no decision change. Section and decision numbers (D1–D15) below refer to that spec.  
**Plan version:** v1.2.11, October 18, 2026 · **Repo baseline:** `mputiyon1985/bestbotfor` `main` at `f7351c3`, re-checked at `799cad4`

## 1. How to use this plan

- The MVP ships as a sequence of **small, independently reviewable PRs** (Track A). Each PR merges to `main` on its own and keeps production unchanged, because everything user-facing sits behind the `userRatingsEnabled()` flag (PR A1), which is **off in production until launch**.
- **Any PR that contains a migration is marked `REQUIRES MARK OK BEFORE MERGE`.** In this plan that is PR A2 only. If any later PR turns out to need a schema change, it must add a new migration file (`0012` or later), carry the same marking and wait for Mark.
- Product screenshots are a **separate track** (Track B, PRs S1–S3). They don't depend on ratings and can ship any time.
- The **"Our rating" rename** is its own one-PR track (Track C, PR R1). It has no data or schema change, doesn't use the ratings flag, and can ship any time (D14, v1.1).
- Sentinel's 11 threat-model gaps map to PRs in the spec's table in section 11.1. Each affected PR below marks its v1.1 additions with the gap number.
- Size estimates are **rough** (dev-days for Tony, excluding Sentinel's review time). Track A totals about 17 dev-days. That includes about 1.75 days for the v1.1 security fixes (Sentinel's 11 gaps), which puts it at the top of the spec's rough 13–17.
- **Every PR in Track A also:** updates the `check:db-writes` allowlist if it adds a DB write; keeps `npm run lint`, `typecheck`, `test`, `build`, `test:e2e`, `check:members`, `check:bundle`, gitleaks, CodeQL and Lighthouse green; reads the local Next 16 docs before using Server Actions, caching or route handler APIs (`AGENTS.md`); sends `Cache-Control: no-store` on authenticated responses; and adds no analytics event outside PR A14.

## 2. Prerequisites (separate from this plan)

- **SEC: rate-limiter security fix: merged as PR #30** (`dcaabf0`, Sentinel QA PASS). The limiter fails closed on writes and abuse-sensitive routes and stays open on read-only pages. `rateLimitKey()` is an HMAC keyed by `RATE_LIMIT_HMAC_SECRET` (already set in Production; Preview is being set), and `jsonLdScript()` escapes JSON-LD. PRs A5, A6, A11 and A13 build on it.
- **PR #28: shared rate window. Merged** as `2927320` on 2026-10-17 at 12:30:26Z. `/result` limits use the shared fixed window. It had to merge before A17 (the T13 test) and before launch (Sentinel gap 3).
- **Tony's P3 batch PR:** delivers A1 (the fail-closed ratings flag, double-gated, with an e2e test that runs with the flag on) and moves the click-log `hashIp()` to the HMAC helper (Sentinel P3-5), keyed by `RATE_LIMIT_HMAC_SECRET` under its own HKDF label.
- **Ops: the new `REVIEW_IP_HMAC_SECRET`** (at least 32 random bytes) and `REVIEW_IP_HMAC_KEY_ID` (for example `k1`) set in Production and Preview **before A1b merges**, because A1b makes those builds fail without them (Sentinel gap 2; split from the limiter secret in v1.2, spec 7.2).
- **CI running.** The GitHub Actions billing lock, recorded in Sentinel's QA report in the team QA workspace, must be cleared, or the e2e jobs and the T10 log-grep step can't run.

## 3. Track A: User ratings MVP

### PR list at a glance

| PR | Title | Migration | Depends on | Rough size |
|---|---|---|---|---|
| A1 | Feature flag (fail closed), **delivered in Tony's P3 batch PR** | No | None | 0 d here |
| A1b | Required HMAC secret check and review key helper | No | Ops secret set | 0.5 d |
| A2 | Migration `0011_user_reviews.sql` and Drizzle schema | **Yes: REQUIRES MARK OK BEFORE MERGE** | None | 1 d |
| A3 | Pure review domain library (incl. IP, name and link checks) | No | None (types from A2 if merged) | 1.5 d |
| A4 | Seed vendor domains | No | A2, A3 | 0.5 d |
| A5 | Review write service | No | SEC, A1b, A2, A3 | 2 d |
| A6 | Rate form page and submit action | No | A1, A5 | 1.5 d |
| A7 | Tool page display, Advertiser label and public reviews API | No | A1, A2, A3 | 1.5 d |
| A8 | `/members/reviews` (my ratings) | No | A5, A6 | 0.5 d |
| A9 | `/admin` foundation, access control, MFA and step-up | No | A1 | 1.5 d |
| A10 | Moderation queue, decisions and audit view | No | A5, A9 | 1.75 d |
| A11 | Report button and reports queue | No | SEC, A7, A10 | 1 d |
| A12 | Admin: vendor domains and sponsor links | No | A4, A9 | 0.5 d |
| A13 | Clerk webhook: deletion and email re-check | No | A2, A5 | 1 d |
| A14 | Analytics events (no PII) | No | A6, A7, A11 | 0.5 d |
| A15 | Policy and content pages (lawyer-review copy) | No | A1 | 0.5 d |
| A16 | JSON-LD user aggregate builder (flag off) | No | A7 | 0.5 d |
| A17 | Launch readiness: security and e2e pass | No | A1–A16, PR #28 | 0.5 d |
| A18 | Launch: turn on in production | No (flag code and constant only) | A17 and **all launch gates** (section 6) | 0.1 d |

Total: about 17 dev-days (A1 now ships in Tony's P3 batch, and A1b takes its slot). A2 is the only PR with a migration.

**Suggested order:** A1 (P3 batch) and A1b (after the ops secret is set) → A2 (wait for Mark's OK) → A3 → A4 → A5 → A6, A7 and A9 in parallel → A8, A10, A12 → A11, A13 → A14, A15, A16 → A17 → lawyer review and launch gates → A18.

### A1: Feature flag (fail closed) · **delivered in Tony's P3 batch PR**

- **Status:** Tony is building this in his P3 batch PR, so no separate A1 PR is needed. The rest of this entry is the acceptance list Sentinel checks against that PR.
- **Scope (Tony's design, spec 9.4):** `userRatingsEnabled()` in `src/lib/flags.ts` is an **explicit opt-in allowlist** (v1.2). It returns true only when `USER_RATINGS === 'on'` **and** `VERCEL_ENV` is `preview`, `development`, or `test`. An unset or unknown `VERCEL_ENV` is off. `NODE_ENV` is not consulted. Production stays off unless `USER_RATINGS_PRODUCTION_LAUNCH` is true. Everything else means off: `production` while that constant is false, typos, and unknown or empty names. The flag-on CI job sets `VERCEL_ENV=test`, because `next start` always runs with `NODE_ENV=production`. **There is no production branch before launch.** Routes are gated in **both** middleware (`src/proxy.ts`) and each page, route handler and Server Action. The code constants `AFFILIATE_LINKS_LIVE = false` and `SHOW_USER_AGGREGATE_JSONLD = false` are added in the same style as `SHOW_SCORES` (in this batch, or in the first Track A PR that needs them). `USER_RATINGS_PRODUCTION_LAUNCH` is already in the code and is false. A18 sets that constant to true.
- **Also in Tony's P3 batch (not part of this plan):** the click-log `hashIp()` moves from salted SHA-256 to the HMAC helper (Sentinel P3-5).
- **Acceptance criteria:** the flag is false for `VERCEL_ENV=production` with `USER_RATINGS=on` while `USER_RATINGS_PRODUCTION_LAUNCH` is false; false for an unknown `VERCEL_ENV` such as `staging`; false for `USER_RATINGS` values other than exactly `on`; true for `preview`, `development`, and `test` with `on`; **false whenever `VERCEL_ENV` is unset, including when `NODE_ENV` is `development`, `test`, `production`, or unset**. `NODE_ENV` is not consulted. A route left out of the middleware matcher still refuses through its handler check.
- **Tests:** a unit table over `VERCEL_ENV` and `USER_RATINGS`, including a check that `NODE_ENV` does not change the result; an **e2e job with the flag on** in a non-production environment (Sentinel's P2); a production-mode e2e proving every review route is 404 and no rating UI renders.
- **Sentinel checks:** the code is an allowlist (a `Set` of permitted values), not a deny-list; fail-closed on unknown values; the double gate exists for every review route (extend `check:members` to require the handler check); the flag is safe to import from `src/proxy.ts` (no Clerk or DB at import); no server env in the client bundle (`check:bundle`).
- **Depends on:** none. Track A PRs that add routes use the helper from the P3 batch.

### A1b: Required review HMAC secret, env checks and review key helper

- **Scope (Sentinel gap 2):** `scripts/check-env.ts`, run in `prebuild`, fails the build when the environment is production, or `USER_RATINGS=on`, and **`REVIEW_IP_HMAC_SECRET`** is missing or shorter than 32 bytes. It also fails if `BBF_E2E_HOOKS=1` and either `VERCEL=1` or `VERCEL_ENV=production` (v1.2, T25). The same secret check runs at boot in `instrumentation.ts`. `reviewHmacKeys()` returns HKDF subkeys of `REVIEW_IP_HMAC_SECRET` (`bestbotfor/review-ip/v1`, `bestbotfor/review-net/v1`), the key id (`REVIEW_IP_HMAC_KEY_ID`) and an optional previous key (`REVIEW_IP_HMAC_SECRET_PREVIOUS`), or throws. It **never** reads `RATE_LIMIT_HMAC_SECRET` and never falls back to PR #30's derived or random keys. Write the review-secret rotation runbook from spec 7.2. It is independent of the limiter's rotation.
- **v1.2.1 security patch (spec 7.2).** Build (`prebuild`) and boot (`instrumentation.ts`) share one `validateSecretEnv(env)`, and either refuses when any rule fails:
    1. `REVIEW_IP_HMAC_SECRET` equals `RATE_LIMIT_HMAC_SECRET` or `REVIEW_IP_HMAC_SECRET_PREVIOUS`. The comparison is constant-time: SHA-256 both values, then compare the digests with `crypto.timingSafeEqual`.
    2. `REVIEW_IP_HMAC_KEY_ID` doesn't match `^k[1-9][0-9]{0,3}$`.
    3. `REVIEW_IP_HMAC_SECRET_PREVIOUS` is set without a valid `REVIEW_IP_HMAC_KEY_ID_PREVIOUS` (same regex, different from the current id), or the previous secret is under 32 bytes. A previous id with no previous secret is also refused.
    4. In production, `RATE_LIMIT_HMAC_SECRET` is missing or under 32 bytes.
    5. Error messages name only the variable and the rule. They never include a value, prefix, length or hash.
- **No backfill.** No review data exists yet: A2 creates the tables, and production stays off until A18. Nothing has been hashed under any key, so nothing needs re-hashing.
- **Files:** `src/lib/review-keys.ts`, `scripts/check-env.ts`, `package.json` (`prebuild`), `instrumentation.ts`, `.env.example` (`REVIEW_IP_HMAC_SECRET`, `REVIEW_IP_HMAC_KEY_ID`, `REVIEW_IP_HMAC_SECRET_PREVIOUS`, `REVIEW_IP_HMAC_KEY_ID_PREVIOUS`, `BBF_E2E_HOOKS` as CI-only), `src/lib/secret-env.ts` (`validateSecretEnv`), `next.config` (build-time inlining of `BBF_E2E_HOOKS`), `specs/review-ip-hmac-rotation.md`.
- **Acceptance criteria:** a production build without the secret, or with a 16-byte secret, fails. A development build with ratings off doesn't need it. `reviewHmacKeys()` throws instead of falling back, and its subkeys differ from the raw secret and from each other. A rotation fixture matches old-key rows through `ip_key_id`. Changing `RATE_LIMIT_HMAC_SECRET` leaves review hashes unchanged. A build with `BBF_E2E_HOOKS=1` and `VERCEL=1` fails. Every v1.2.1 rule refuses at **both** build and boot.
- **Tests:** check-env tests (missing, short, valid, hooks combined with Vercel or production); key helper unit tests; a rotation test; a secret-independence test. **v1.2.1:**
    - The review secret equal to the limiter secret, or to the previous secret, is refused. A `timingSafeEqual` spy confirms the constant-time compare.
    - Key ids `k1`, `k12` and `k9999` pass. `K1`, `k0`, `k01`, `k10000`, `key1`, `k1 ` and empty are refused.
    - Previous secret: without its id, with an invalid id, with the same id as current, or at 31 bytes, refused. A previous id with no previous secret is refused.
    - Production with a missing or 31-byte `RATE_LIMIT_HMAC_SECRET` is refused. Preview is not refused by this rule.
    - Captured stdout and stderr from failing checks contain no secret fragment.
- **Sentinel checks:** the secret value is never logged, only its name. **Confirm `REVIEW_IP_HMAC_SECRET` is set in Production and Preview, and that the Production `RATE_LIMIT_HMAC_SECRET` is at least 32 bytes and differs from it, before merging.** Otherwise production builds fail (the live deployment keeps serving).
- **Depends on:** the ops secret (section 2). Rough size 0.5 d.

### A2: Migration `0011_user_reviews.sql` and Drizzle schema · **REQUIRES MARK OK BEFORE MERGE**

- **Scope:** one additive migration that creates `reviews`, `review_versions`, `review_reports`, `moderation_events`, `review_aggregates`, `tool_vendor_domains`, `tool_sponsor_links`, `user_tombstones` and `webhook_events` (spec 5.2), including `reviews.ip_hmac`, `net_hmac` and `ip_key_id` and the `(tool_id, net_hmac, created_at)` index (Sentinel gap 1), with the indexes, CHECK constraints, `unique(clerk_user_id, tool_id)`, and the append-only triggers on `review_versions` content and on `moderation_events`. Mirror the tables in `src/lib/db/schema.ts`. Every statement uses `IF NOT EXISTS`. No `ALTER`, `DROP`, `UPDATE` or `DELETE` on existing tables.
- **Files:** `drizzle/0011_user_reviews.sql` (or the next free number at or above 0011 at merge time; `0009` and `0010` belong to PRs #10 and #28), `src/lib/db/schema.ts`, `scripts/check-db-writes.ts` (allowlist the migration file), `src/lib/db/migrate.test.ts`.
- **Acceptance criteria:** the migration applies cleanly on an empty `file:` DB and on a copy of the current schema, and running it twice is a no-op. The append-only triggers abort an UPDATE of `review_versions.stars` and any UPDATE or DELETE on `moderation_events`. The unique index rejects a second `(user, tool)` row. CHECKs reject `stars` 0 and 6, `weight` 2.0, and an unknown `status`.
- **Tests:** migration unit tests against `:memory:` and `file:` DBs, a constraint and trigger test for each rule above, and a test that records whether foreign keys are enforced on the libsql connection (spec 5.1). Code must not rely on the result.
- **Sentinel checks:** the DB guard still blocks preview builds from the production host. The migration filename doesn't collide with #10 or #28 (check the `schema_migrations` ledger on preview-test after deploy). Triggers parse correctly through `executeMultiple`. No PII columns beyond the spec (no email, no raw IP, no raw network prefix).
- **Depends on:** none. Rebase onto whatever lands first among #10 and #28 before merge.
- **Merge rule:** **Mark's explicit OK in the PR is required before merge.**

### A3: Pure review domain library

- **Scope:** side-effect-free modules: zod schemas for the form (stars 1–5, field caps, enums, connection rules), text normalization (NFC; strip control, bidi-override and zero-width characters), reason-code list with plain-language labels, trust tier, the weighting formula and rounding (spec 6), review ordering (recent, highest, lowest), the threshold gate (N ≥ 5), and eTLD+1 extraction using a maintained Public Suffix List library (proposed: `tldts`). **v1.1 additions:** `trustedClientIp(headers, env)` (trust `x-vercel-forwarded-for`, then the first `x-forwarded-for`, only when `isVercelDeployment(env)` is true; validate IPv4 and IPv6; return null otherwise; gap 4). **v1.2: this PR owns the "running on Vercel" decision.** `isVercelDeployment(env)` is `VERCEL === '1'` and `VERCEL_ENV` is `production` or `preview` and `VERCEL_REGION` is set, with the environment passed in for testing. The test-only `x-bbf-test-ip` hook sits behind the build-time `BBF_E2E_HOOKS === '1'` branch and refuses when `isVercelDeployment()` is true or `VERCEL_ENV === 'production'`; `networkPrefix()` (IPv4 /24, IPv6 /48) and `ipHashes()` producing `ip_hmac`, `net_hmac` and `ip_key_id` with the A1b keys (gap 1); `checkDisplayName()` (NFKC, case fold, TR39 skeleton, mixed-script refusal, reserved terms plus the tool and vendor names; gap 7); `linkSignals()` (URLs, bare domains via `tldts`, emails, phones, and own-domain or competitor URLs; gap 6). It returns **hints only**, a list of labels, and has no block, hold or reject output (v1.2).
- **Files:** `src/lib/reviews/schema.ts`, `normalize.ts`, `reasons.ts`, `score.ts`, `order.ts`, `domain.ts`, `ip.ts`, `display-name.ts`, `links.ts`, plus `*.test.ts`; `package.json` for the PSL dependency; the TR39 confusables data (a vetted package or a vendored, versioned copy of Unicode's `confusables.txt`).
- **Acceptance criteria:** the worked example in spec 6 (5, 5, 4, 2, 4 with weights 1.0, 1.5, 1.0, 1.0, 1.5) returns 4.1. No average is returned when N < 5. Ordering and score functions take **no** sponsor or affiliate input (type-level and test). There is no reason code with sentiment wording. "BestBotFor T.", "Bеstbotfor T." (Cyrillic е), "Admin M." and "OpenAI S." (on ChatGPT) are refused, and "Maria L." passes. `203.0.113.7` and `203.0.113.200` share a `net_hmac` but have different `ip_hmac` values, and the same holds within one IPv6 /48. A forged `X-Forwarded-For` is ignored outside Vercel. Junk IP strings return null.
- **Tests:** unit tests for every function, including property tests for score bounds (always 1.0–5.0), normalization fixtures (RTL override, zero-width joiner, `</script>`), a homoglyph corpus, IPv4 and IPv6 prefix fixtures (including IPv4-mapped IPv6), and a link corpus. **v1.2:** a `trustedClientIp()` and `isVercelDeployment()` unit table (on Vercel with valid, malformed or missing headers; `VERCEL=1` without `VERCEL_REGION`; off Vercel with a forged `X-Forwarded-For`; `VERCEL_ENV=development`); hook tests (ignored when `BBF_E2E_HOOKS` is unset, refused on Vercel or in production); a test that `linkSignals()` output can't change a review's status.
- **Sentinel checks:** review the new dependencies or vendored data (licence, maintenance, `npm audit`, no install scripts). The sponsor-blind test exists. No raw IP or prefix appears in any return value that gets stored.
- **Depends on:** none (uses the A1b key helper's interface; tests inject keys).

### A4: Seed vendor domains

- **Scope:** `scripts/seed.ts` upserts `tool_vendor_domains` with `source = 'tool_url'` from each tool's catalog URL (eTLD+1 via A3). It never deletes `manual` rows and never touches review tables.
- **Files:** `scripts/seed.ts`, `src/lib/db/seed.test.ts`.
- **Acceptance criteria:** every tool gets at least one domain row. Re-running the seed is idempotent. Manual rows survive.
- **Tests:** a seed test that asserts no writes to `reviews`, `review_versions`, `review_reports`, `review_aggregates` or `moderation_events`.
- **Sentinel checks:** the seed runs at build time and therefore writes to production on deploy. Confirm it is an additive upsert only and stays inside the DB guard.
- **Depends on:** A2, A3.

### A5: Review write service

- **Scope:** `src/lib/reviews/write.ts`: eligibility (Clerk `currentUser()` on writes only, verified primary email, 72-hour wait (D1), staff and banned blocks), vendor domain check against **all** verified emails, fail-closed rate limits via the SEC helper (spec 7.2 limits), submit (insert or update on `(user, tool)` plus a new `review_versions` row, status `pending` (D2)), edit (new version, published version stays live), delete (status `withdrawn`, content purge scheduled), aggregate recompute in the same transaction, one `moderation_events` row per change, and a disclosed connection setting `counts_toward_score = 0` (D9). User id always comes from the session. **v1.1:** stores `ip_hmac`, `net_hmac` and `ip_key_id` from A3 (gaps 1 and 2); a missing or invalid client IP fails closed with `unavailable`, never a shared bucket (gap 4); a limiter error or timeout returns `unavailable`, distinct from `rate_limited` (gap 9); `checkDisplayName()` refusal returns `name_blocked` with nothing saved (gap 7); link signals are saved as queue hints (gap 6); after commit, it revalidates tag `reviews:<slug>` and path `/tools/<slug>` on delete and on any change to published content (gap 11).
- **Files:** `src/lib/reviews/write.ts`, `src/lib/reviews/aggregate.ts`, `src/lib/reviews/eligibility.ts`, tests; `scripts/check-db-writes.ts` (allowlist).
- **Acceptance criteria:** each blocked case (unverified, waiting, staff, banned, vendor domain, name blocked, rate-limited, limiter unavailable, no valid IP, HMAC key unavailable) creates **no** review row and returns a typed reason. 20 concurrent submits by one user for one tool leave one row. Every state change writes exactly one audit row.
- **Tests:** unit and integration tests against a `file:` DB with a mocked Clerk user; a concurrency test; limiter-failure and limiter-timeout tests (must refuse with `unavailable`); a null-IP test; a missing-key test; a revalidation spy test (delete calls tag and path revalidation after commit).
- **Sentinel checks:** no user id read from input; no email, raw IP or raw prefix persisted anywhere, including logs; only the A1b key helper is used for stored hashes; the aggregate recompute matches a full rebuild.
- **Depends on:** SEC, A1, A2, A3.

### A6: Rate form page and submit action

- **Scope:** `/tools/[slug]/rate` page with the form (spec 4.2) and every UI state (spec 4.3); Server Action `submitReview` calling A5; attestation text with version `2026-10-v1`; works without JavaScript; remembers the last use-case answers (WCAG 3.3.7). Hidden and 404 when the flag is off.
- **Files:** `src/app/tools/[slug]/rate/page.tsx`, `src/app/tools/[slug]/rate/actions.ts`, `src/components/review-form.tsx`, `scripts/check-member-routes.ts` (cover the new action).
- **Acceptance criteria:** every state in spec 4.3 renders with the exact copy, including the new "Display name not allowed" and "Temporarily unavailable" states (v1.1). "Temporarily unavailable" never shows the rate-limit wording. The star input is a native fieldset and radio group. The error summary takes focus. With the flag off: a 404 page and the action refuses.
- **Tests:** Playwright flows for each state (fixtures for an unverified user, an account under 72 hours old and a vendor-domain user); axe with zero violations on each state; keyboard-only submit.
- **Sentinel checks:** the Server Action origin check behaves as the Next 16 docs say; unknown form fields are rejected; payload fuzzing (oversized text, bidi, `</script>`); a 1 MB body is refused.
- **Depends on:** A1, A5.

### A7: Tool page display, Advertiser label and public reviews API

- **Scope:** the comparison strip ("Our rating" beside "Users X.X (N)", D14), the "not enough ratings yet (N of 5 needed)" state with reviews listed (D7), "What users say" with the raw star distribution, sort options, server-rendered pagination of 10, the "Edited [date]" marker (D15), the disclosure-first line (D9), names as "First L." (D8). The Advertiser label shows on an active `tool_sponsor_links` row, or on an approved affiliate program with a tracking link in use when `AFFILIATE_LINKS_LIVE` is true (D6). `GET /api/tools/[slug]/reviews` serves published reviews with a public field allowlist and no average when N < 5. **v1.1:** all user text is rendered as plain text, with no autolinking and no `<a>` built from user content (gap 6). Review reads are tagged `reviews:<slug>`. The API sends `s-maxage` of 60 seconds or less (gap 11). The strip's "Our rating" item links to the `#our-rating` section added by R1 (D14).
- **Files:** `src/app/tools/[slug]/page.tsx`, `src/components/user-rating-strip.tsx`, `src/components/user-reviews.tsx`, `src/lib/reviews/read.ts`, `src/app/api/tools/[slug]/reviews/route.ts`.
- **Acceptance criteria:** the strip matches the formula for fixture data. N = 4 shows no number anywhere (HTML, API). Toggling a sponsor link changes the label only, never order or score. With the flag off the tool page is byte-identical to today apart from build hashes.
- **Tests:** component tests; an API snapshot of the JSON keys; a sponsor-toggle test; Playwright on `/tools/chatgpt` with fixtures; axe; Lighthouse budget unchanged.
- **Sentinel checks:** review text rendered as text only (no `dangerouslySetInnerHTML`, no linkify library); a link-corpus fixture produces no `<a>` from user content; no email, Clerk id or IP hash in the API or HTML; cache revalidation doesn't leak pending content.
- **Depends on:** A1, A2, A3. Can be built in parallel with A5 using fixtures.

### A8: `/members/reviews` (my ratings)

- **Scope:** list of the user's reviews with status ("Pending review", "Live", "Edit in review", "Not published: reason"), edit links to the rate form, and a `deleteMyReview` action. JSON export is not in MVP (hardening).
- **Files:** `src/app/members/reviews/page.tsx`, `src/app/members/reviews/actions.ts`.
- **Acceptance criteria:** a user sees only their own reviews. Deleting hides the review at once, recomputes the aggregate and revalidates the tool page and API (the cached page no longer shows it).
- **Tests:** an IDOR test (deleting another user's review id is refused); Playwright; axe.
- **Sentinel checks:** covered by the existing `/members` `auth.protect()` and `check:members`; `no-store` header.
- **Depends on:** A5, A6.

### A9: `/admin` foundation, access control, MFA and step-up

- **Scope:** `/admin` layout and landing page; the guard requires Clerk `publicMetadata.role === 'admin'` **and** membership in `ADMIN_CLERK_USER_IDS`, and runs in `src/proxy.ts`, in `src/app/admin/layout.tsx` and in a shared `requireAdmin()` for every action. Non-admins get a 404. Add `no-store`, `X-Robots-Tag: noindex, nofollow`, exclusion from `sitemap.ts`, `robots.ts`, `llms.txt` and `llms-full.txt`, and no GA. Extend `scripts/check-member-routes.ts` so every file under `src/app/admin/` must call the guard. **v1.1 (Sentinel gap 5):** the guard also requires a second factor enrolled on the Clerk user and a second-factor-verified session. Admins without MFA see only a "Set up MFA" page. `requireAdminStepUp()` enforces Clerk's `strict_mfa` reverification (`auth.has()` on the server, `useReverification()` on the client) for destructive actions, and checks enrollment separately because Clerk downgrades the level when no second factor exists. Clerk's app-wide "Require MFA" toggle stays off, because it would apply to every member.
- **Files:** `src/proxy.ts`, `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/mfa-required/page.tsx`, `src/lib/admin.ts`, `scripts/check-member-routes.ts`, `.env.example`.
- **Acceptance criteria:** signed-out, normal and role-only (not allowlisted) users all get a 404. An allowlisted admin **without MFA** sees only the setup page, and every admin action refuses. An allowlisted admin with MFA sees the page. A destructive action without a fresh check prompts reverification and succeeds only after it.
- **Tests:** Playwright with four user fixtures (signed out, normal, role-only, admin without MFA) plus the MFA admin; a step-up test with a stale and a fresh verification; a headers test; a sitemap and llms test; the CI check fails on a deliberately unguarded file (test fixture).
- **Sentinel checks:** guard order (no data fetched before the check); the allowlist is read server-side only; the MFA check can't be skipped by calling an action directly (T19); Mark and James are enrolled before launch.
- **Depends on:** A1.

### A10: Moderation queue, decisions and audit view

- **Scope:** `/admin/reviews` queue (oldest first; filters for status, tool, rule fired and sponsored), `/admin/reviews/[id]` detail with Approve, Reject, Remove and Restore (reason code required for Reject and Remove; note required for Restore), optimistic concurrency (`expectedVersion`), the state machine (spec 8.2), aggregate recompute, the **James second-review list** for removals and rejections on sponsored tools (D3), and a read-only `/admin/audit` with a CSV export (no PII columns). Simple PII hints (email and phone patterns), the link-and-contact, multiple-links and vendor or competitor link hints (gap 6), and the display-name hint (gap 7) shown to the moderator. **Hints never change status on their own** (v1.2): a review with a competitor link stays `pending` until a human decides. Reject, Remove, Restore and the audit CSV export require step-up (A9). **Every decision revalidates tag `reviews:<slug>` and path `/tools/<slug>` after commit (gap 11).**
- **Files:** `src/app/admin/reviews/**`, `src/app/admin/audit/page.tsx`, `src/lib/reviews/moderation.ts`, `scripts/check-db-writes.ts`.
- **Acceptance criteria:** illegal transitions are refused. Every decision writes one audit row with actor, reason, from and to states. A removal on a sponsored tool appears in James's list. Two admins deciding the same item: the second gets a conflict message. **Cache test (T22):** cache a tool page and the API with a published review, remove it, and the next production-mode response no longer contains it.
- **Tests:** state-machine unit tests (every allowed and disallowed transition); Playwright for each decision; the T22 cache test; a step-up refusal test; axe on the queue and detail pages; a link-corpus fixture showing no `<a>` in admin views.
- **Sentinel checks:** no free-form rejection without a code; the star value has no effect on available actions; audit rows can't be edited (trigger from A2).
- **Depends on:** A5, A9.

### A11: Report button and reports queue

- **Scope:** "Report" on each published review (sign-in required, reason code plus a note of up to 500 characters, one report per user per review, fail-closed rate limits, with the per-IP key taken from A3's `trustedClientIp()`); `/admin/reports` grouped by review with Uphold (leads to Remove with a code) and Dismiss. Reports never auto-hide a review in MVP.
- **Files:** `src/app/tools/[slug]/report-actions.ts`, `src/components/report-review.tsx`, `src/app/admin/reports/**`.
- **Acceptance criteria:** 20 reports from different accounts leave the review published and show one grouped queue item. A duplicate report by the same user is a no-op.
- **Tests:** unit, Playwright and axe; rate-limit test.
- **Sentinel checks:** report-bombing scenario (T14); notes rendered as text only in admin.
- **Depends on:** SEC, A7, A10.

### A12: Admin: vendor domains and sponsor links

- **Scope:** `/admin/vendor-domains` (add or remove `manual` domains per tool, with eTLD+1 validation) and `/admin/sponsor-links` (create or end a link, optionally tied to a `sponsorships` row from PR #10). Every change is audited (`sponsor_link_set`), requires step-up (A9), and sponsor-link changes revalidate the tool page.
- **Files:** `src/app/admin/vendor-domains/**`, `src/app/admin/sponsor-links/**`.
- **Acceptance criteria:** adding `openai.com` to ChatGPT blocks a test user with that verified domain. Ending a sponsor link removes the label and changes nothing else.
- **Tests:** unit and Playwright; audit row assertions.
- **Sentinel checks:** the guard is present on every action; sponsor links have no effect on order or score (re-run the A7 test).
- **Depends on:** A4, A9.

### A13: Clerk webhook: deletion and email re-check

- **Scope:** `POST /api/webhooks/clerk` with `verifyWebhook()` and `CLERK_WEBHOOK_SIGNING_SECRET`; idempotency through `webhook_events`; `user.deleted` deletes the user's reviews, versions and reports (D4), recomputes aggregates, writes HMAC-only audit rows and a tombstone; `user.updated` flags existing reviews when a newly verified email matches the vendor domain. Late events after a tombstone are ignored. **v1.1:** erasure revalidates the tag and path for every tool the user had reviewed (gap 11). `user.updated` with a name change re-runs `checkDisplayName()` and flags published reviews whose snapshot would now fail (gap 7). **Active even when the feature flag is off.** Excluded from Clerk protection in `src/proxy.ts`, with a body size cap.
- **Files:** `src/app/api/webhooks/clerk/route.ts`, `src/lib/reviews/erasure.ts`, `src/proxy.ts`, `scripts/check-db-writes.ts`, `.env.example`.
- **Acceptance criteria:** a signed `user.deleted` removes all of that user's review data and leaves no Clerk id in any table. Unsigned, bad-signature, replayed and oversized requests change nothing.
- **Tests:** route tests with signed fixtures (the Svix test signing approach in Clerk's docs); replay test; a DB scan for the deleted id afterward; the T22 cache test for erasure; a name-change flag test.
- **Sentinel checks:** the secret is scoped per environment in Vercel; no payload is logged; constant-time verification is handled by the library.
- **Depends on:** A2, A5.

### A14: Analytics events (no PII)

- **Scope:** add `review_cta_click`, `review_form_start`, `review_submit`, `review_edit_submit`, `review_delete`, `review_report` and `review_sort_change` to `ANALYTICS_EVENTS`, with `PARAM_RULES` for `result` (including the v1.1 values `unavailable` and `name_blocked`), `reason` and `sort` (spec 12). Consent-gated through the existing `track()`. No analytics on `/admin`.
- **Files:** `src/lib/analytics.ts`, `src/lib/analytics-page.test.ts` (or a new test), the components from A6, A7 and A11.
- **Acceptance criteria:** stars, text, review id and user id are never sent (dropped by the allowlist).
- **Tests:** unit tests on `track()` param filtering; e2e asserting no gtag call before consent (extends `e2e/consent.spec.ts`).
- **Sentinel checks:** network capture during a full review flow contains only allowlisted params.
- **Depends on:** A6, A7, A11.

### A15: Policy and content pages (lawyer-review copy)

- **Scope:** draft copy for the review guidelines page, the "How user ratings work" page (formula, tiers, threshold, moderation reasons, the transparency line placeholder), the privacy policy section for ratings and retention (spec 10.3, which in v1.1 mentions the keyed hash of the IP's network range), a `/terms` link to the guidelines, and a `/disclosure` paragraph on the Advertiser label. The new pages and the new privacy section render only when the flag is on, so production text doesn't describe an unlaunched feature. **This copy is the package for the lawyer review (section 6).**
- **Files:** `src/app/review-guidelines/page.tsx`, `src/app/how-user-ratings-work/page.tsx`, `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, `src/app/disclosure/page.tsx`.
- **Acceptance criteria:** the copy matches the spec claims rules (spec 10.1: no "verified buyers", no "all reviews"). The "last updated" date changes when the privacy section goes live.
- **Tests:** a copy test in the style of `e2e/copy.spec.ts` for banned phrases; axe.
- **Sentinel checks:** the privacy text matches what the code actually stores (cross-check against A2 and A5).
- **Depends on:** A1.

### A16: JSON-LD user aggregate builder (flag off)

- **Scope:** `userAggregateRatingJsonLd()` in `src/lib/jsonld.ts` (only when N ≥ 5, values only from `review_aggregates`), nested in `SoftwareApplication`; a narrow, branded exception in `jsonLdForPage()`; serialization through PR #30's existing `jsonLdScript()` (which already escapes `< > &` and U+2028/U+2029, gap 10). No new escaping work. The output stays behind `SHOW_USER_AGGREGATE_JSONLD = false` (D10: on only in hardening).
- **Files:** `src/lib/jsonld.ts`, `src/lib/score-visibility.ts`, tests.
- **Acceptance criteria:** with the constant false, no rating keys appear in any JSON-LD (the existing behavior). With it true in tests: present only when N ≥ 5, value equals the visible number, never on `Organization` or `WebSite`, and the editorial score never appears.
- **Tests:** unit tests for all four assertions in spec 9.3; a `</script>` tool-name fixture.
- **Sentinel checks:** the aggregate goes through `jsonLdScript()`; review text, names and notes never appear in JSON-LD.
- **Depends on:** A7.

### A17: Launch readiness: security and e2e pass

- **Scope:** close any gaps found in Sentinel's full run of the threat-model tests (spec 11, **T1–T26**, and every row of spec 11.1 and 11.2); the production-mode e2e test proving the feature is invisible before the launch PR; the flag-on e2e job; **T10 log grep** (v1.2: CI writes the `next start` output to a file, uploads it as a build artifact kept for **7 days** (`retention-days: 7`; it holds only synthetic test data: fixture accounts, a `203.0.113.0/24` documentation IP and a fake Clerk id), and a required step greps it for the test email, the test IP and the test Clerk id, failing the job on any match; gap 8); **T25 test-hook check** (a normal production build ignores `x-bbf-test-ip`, and `.next` contains no such string; a hooks build run with `VERCEL_ENV=production` refuses it); **T13 with PR #28 merged** (11th per-IP submission limited across instances; forced limiter failure shows "temporarily unavailable"; gaps 3 and 9); final axe and Lighthouse run; a written QA report in `qa-user-ratings.md`.
- **Files:** `e2e/reviews*.spec.ts`, `e2e/security.spec.ts`, the CI workflow (server log artifact and grep step), `scripts/grep-server-log.ts`, fixes as needed.
- **Acceptance criteria:** every T1–T26 test passes or has a written, Mark-approved exception. Production-mode build: no rating UI, review routes return 404, the webhook still works.
- **Tests:** as listed.
- **Sentinel checks:** sign-off recorded in the QA report.
- **Depends on:** A1 (P3 batch), A1b–A16, and PR #28.

### A18: Launch: turn on in production

- **Scope:** the **only** way production can be enabled. Change `userRatingsEnabled()` to also allow production, and only when the code constant `USER_RATINGS_PRODUCTION_LAUNCH === true` and `USER_RATINGS === 'on'`. Add the constant as `true`, and set `USER_RATINGS=on` in the production env. Nothing else in the PR. An env var alone can never turn the feature on in production.
- **Files:** `src/lib/flags.ts` and its unit table only.
- **Acceptance criteria:** **all launch gates in section 6 are checked in the PR description**, with links to the lawyer's sign-off, Mark's approval and Sentinel's QA report.
- **Tests:** a post-deploy smoke test (rate form reachable for an eligible test account, strip renders, admin queue reachable for Mark).
- **Sentinel checks:** monitor the first 48 hours (queue size, holds, errors). Rollback is a revert of this PR (or setting the constant to `false`).
- **Depends on:** A17 and every launch gate.

## 4. Track B: Product screenshots (separate track)

Spec section 16. No migrations, no dependency on Track A, and no feature flag needed (a tool with no manifest entry renders exactly as today).

| PR | Title | Depends on | Rough size |
|---|---|---|---|
| S1 | Screenshot manifest, storage layout and `check:screenshots` | None | 1 d |
| S2 | `ToolScreenshots` component on tool pages | S1 | 1 d |
| S3 | First screenshot batch and quarterly refresh runbook (Forge) | S1, S2 | 0.5 d dev, plus Forge capture time |

### S1: Screenshot manifest, storage layout and `check:screenshots`

- **Scope:** `public/screenshots/<slug>/<n>-<YYYY-MM>.webp` layout; `src/data/screenshot-manifest.json` (slug, file, width, height, alt, capturedAt, sourceType, sourceUrl, licenseNote) with a zod schema; `src/data/screenshot-sources.csv`; a `check:screenshots` script (files exist, dimensions match the file, alt present and not generic, source fields present, at most 2 per tool, at most 200 KB and 1600 px wide) that **warns** when `capturedAt` is more than 100 days old. Added to CI.
- **Acceptance criteria:** the check fails on a missing file, wrong dimensions, empty or generic alt, or an external URL, and warns on a stale date.
- **Tests:** unit tests on the schema and checker with fixtures.
- **Sentinel checks:** no remote URLs allowed in the manifest; the files are served same-origin (CSP `img-src 'self'` unchanged).

### S2: `ToolScreenshots` component on tool pages

- **Scope:** a server component placed after the tool description, rendering a `<figure>` per image with explicit `width` and `height`, `loading="lazy"`, `decoding="async"`, responsive `sizes`, the manifest alt text, and the caption "Screenshot as of <Month YYYY>" (plus "Captured by BestBotFor" or "Image: [Vendor]"). With no entries, render nothing.
- **Acceptance criteria:** no layout shift (CLS budget unchanged); tools without screenshots render byte-identically apart from build hashes; no external image URLs on tool pages.
- **Tests:** component tests; snapshot for the no-screenshot case; Playwright and axe on `/tools/chatgpt` with a fixture image; Lighthouse.
- **Sentinel checks:** alt text present on every image; no hotlinks.

### S3: First screenshot batch and quarterly refresh runbook (Forge)

- **Scope:** Forge captures or downloads the first batch (target: the top tool in each category) from press kits, official pages or our own public-page captures only, then fills the manifest and source log. Add `specs/screenshots-refresh-runbook.md`: quarterly schedule, sourcing rules, alt-text rules, takedown handling (within 5 business days), and the refresh PR checklist.
- **Acceptance criteria:** `check:screenshots` passes. Every image's source is official or our own public capture, with no personal data on screen.
- **Tests:** CI check; a visual spot check by Sentinel.
- **Sentinel checks:** licence notes recorded for press-kit images; no logged-in or customer data visible.

## 5. Track C: "Our rating" label rename (separate, ships any time)

Spec D14 (changed in v1.1). One small PR. No migration, no data or schema change, no dependency on Track A, and **no use of the ratings feature flag**. It can merge before, during or after the ratings work.

### R1: Rename "BestBotFor score" to "Our rating" sitewide

- **Scope:** change the editorial score's label everywhere on the site: UI copy, the how-we-rate page, metadata and alt text.
    - Set `SCORE_HEADING` to `'Our rating'`. That one constant drives the heading on every scored tool page and the text `omitScoreText()` removes when `SHOW_SCORES` is false.
    - Give the `ScoreSection` heading the anchor `id="our-rating"`, so A7's strip can link to it later.
    - Reword the how-we-rate metadata description and add one sentence to `how-we-rate.md` that names the label (copy below, for Mark's OK).
    - Update the code comments, the README and the tests listed below.
    - `HOW_WE_SCORE_HEADING` ("How we score"), the star `aria-label` ("Rated X out of 5"), scores, ranks and JSON-LD rating handling are unchanged.
- **Where "BestBotFor score" appears today.** I searched `main` (`dcaabf0`, read-only) through the GitHub connector for `"BestBotFor score"`. It found **8 files**, which contain **19 exact occurrences plus 1 close wording**, so **20 places** in total:

| # | File | Line(s) | Kind | Change |
|---|---|---|---|---|
| 1 | `src/lib/score-visibility.ts` | 6 | **UI copy (source of the visible heading)**: `export const SCORE_HEADING = 'BestBotFor score'` | `'Our rating'` |
| 2 | `src/app/how-we-rate/page.tsx` | 16 | **Metadata** description: "BestBotFor scores each AI tool against rivals…" (close wording, not the exact label) | "We rate each AI tool against rivals that do the same job. … Our rating is editorial." |
| 3 | `README.md` | 9 | Docs: "A BestBotFor score is an editorial rating from 0 to 5…" | "Our rating (the editorial score) is…" |
| 4 | `src/lib/site.ts` | 11 | Code comment on `SHOW_SCORES` | "Sitewide switch for Our rating: …" |
| 5 | `src/lib/editorial.ts` | 4 | Code comment | "Our rating is an editorial rubric, not a user review." |
| 6–13 | `e2e/editorial.spec.ts` | 29, 54, 55, 73, 139, 169, 204, 242 (8) | Tests: heading visible or absent (6); meta and OG description must not contain the label when scores are hidden (2) | Heading name → "Our rating"; in the two regexes, replace `BestBotFor score` with `Our rating` |
| 14–19 | `src/lib/score-visibility.test.ts` | 38, 89, 133, 167, 174, 180 (6) | Unit tests: fixture copy, heading value, and JSON-LD, card and section text | Same strings → "Our rating" |
| 20 | `src/lib/editorial.test.ts` | 27 | Test suite name `describe('BestBotFor score', …)` | `describe('Our rating (editorial score)', …)` |

- **Not found:** no alt text, image file name, OG image text, `llms.txt` source, sitemap entry or JSON-LD string contains the label. Alt and aria text needs no change: the stars use "Rated X out of 5". `src/content/how-we-rate.md` doesn't contain the phrase, so the sentence below adds the label there.
- **Proposed how-we-rate copy (for Mark's OK):** add after the first paragraph: "**On each tool page, this score appears as \"Our rating\".** It's our editorial rating, separate from any ratings users leave." The second sentence anticipates user ratings. Drop it if Mark prefers to wait.
- **Search caveat:** GitHub code search indexes only the default branch and skips very large files. Before opening the PR, Tony runs `rg -n -i "bestbotfor score"` over the whole repo and fixes any extra hit. Open PRs (#10, #28) are not covered by the search. Tony checks them when rebasing.
- **Files:** `src/lib/score-visibility.ts`, `src/components/score-section.tsx` (or wherever `ScoreSection` lives, for the anchor only), `src/app/how-we-rate/page.tsx`, `src/content/how-we-rate.md`, `README.md`, `src/lib/site.ts`, `src/lib/editorial.ts`, `e2e/editorial.spec.ts`, `src/lib/score-visibility.test.ts`, `src/lib/editorial.test.ts`.
- **Acceptance criteria:** after the PR, `rg -n -i "bestbotfor score"` finds nothing in `src/`, `e2e/`, `public/` or `README.md`. Every scored tool page shows one `h2` "Our rating" with `id="our-rating"`. With `SHOW_SCORES = false` in tests, the heading, the label in meta and OG descriptions, and JSON-LD rating keys are all absent, as before. `omitScoreText()` removes "Our rating" but leaves "Your rating" (the A6 form legend) and other text intact. There are no DB writes, no migration and no flag check.
- **Tests:** the updated e2e and unit tests above, plus a new unit test for the "Your rating" case; axe with zero violations; Lighthouse budgets unchanged.
- **Sentinel checks:**
    - The diff is copy, comments, tests and one anchor `id` only.
    - The page keeps one "Our rating" heading.
    - Production HTML after deploy: no "BestBotFor score" on `/tools/*`, `/how-we-rate` or in meta tags. A spot-check of the 186 pages Sentinel already crawls is enough.
    - `jsonLdScript()` output is unchanged apart from strings.
- **Depends on:** none. **Rough size:** 0.5 d. **Migration:** none (no Mark OK needed beyond normal review).

## 6. Launch gates (all required before PR A18 merges)

1. **Lawyer review signed off (D13). Recorded October 17, 2026, 10:46 AM ET** by James, for Mark. Mark confirmed the lawyer reviewed both the #39 drafts (the review guidelines, how user ratings work, and the ratings additions on `/privacy`, `/terms`, and `/disclosure`) and the base policy pages (`/privacy`, `/terms`, and `/disclosure`). Scope, matching D13: the review guidelines and moderation policy, the attestation and connection-disclosure wording, the Advertiser label text, and the privacy policy and retention changes. Mark (via James, 7:44 AM ET on October 18, 2026) is skipping the lawyer sign-off and publishing the privacy policy. There is no signed lawyer document. Do not invent a URL. This gate does not launch ratings. `USER_RATINGS_PRODUCTION_LAUNCH` stays false. `/review-guidelines` and `/how-user-ratings-work` stay `noindex, nofollow` until the launch PR. `POLICY_PAGES_LAWYER_APPROVED` is the ratings-not-launched gate for those two pages, not the lawyer-review switch, and it stays false.
2. **Mark approves** the final copy and the A18 PR. Mark-approved via James relay at 7:04 PM ET; closes when the A18 PR is reviewed and merged.
3. **Sentinel signs off** on A17 (T1–T26 and every row of spec 11.1 and 11.2, axe, Lighthouse, headers, the cache test, the production-mode and flag-on tests). Open.
4. **Ops ready:** `CLERK_WEBHOOK_SIGNING_SECRET`, `ADMIN_CLERK_USER_IDS` and `REVIEW_STAFF_USER_IDS` set per environment; `RATE_LIMIT_HMAC_SECRET` set in Production and Preview (at least 32 bytes in Production); `REVIEW_IP_HMAC_SECRET` (at least 32 bytes) and `REVIEW_IP_HMAC_KEY_ID` set and checked in Production and Preview; CI running; Mark and James have the Clerk admin role **and MFA enrolled**. Open. PR #28 is already merged (`2927320`).
5. **Rollback documented** in the A18 PR (revert the constant). Open.
6. **Branch protection.** Re-read October 17, 2026. The active ruleset is still id `25190130`, named `main`, on the default branch, updated `2026-10-17T19:23:14Z`. The rules API did not show a replacement. A pull request is required, so direct pushes are blocked. Force-push and branch deletion are blocked. James decided the required approving review count on `main` stays 0. With 1 required, Mark can't approve his own PRs and merges stall. Required status checks are not set. `require_extra_approval_for_unattributed_changes` is still true on this ruleset.
7. **Review-secret rotation.** Ops follows the review-secret rotation in spec 7.2: a new key id, the previous key kept for 90 days, and `RATE_LIMIT_HMAC_SECRET` on its own schedule. Open until that runbook is confirmed. This gate does not rotate a secret.
8. **Clerk development admin tests.** In the development Clerk instance, an admin who has MFA can open `/admin`, and a signed-in user who is not an admin cannot. Open. No result is claimed here.
9. **Turso token rotation at launch.** Ops rotates the production `TURSO_AUTH_TOKEN` at launch and confirms the app still connects. Open. This gate does not rotate a token.
10. **Privacy policy and review guidelines merged and visible** (spec section 13). `/privacy`, `/terms`, and `/disclosure` are on main and index in production. `/review-guidelines` and `/how-user-ratings-work` are in the repo and stay hidden until ratings launch. Open until those guidelines are visible. They may go live just before the flag flips.
11. **Launch checklist: internal status text.** The ratings launch PR rewords the internal status text. This plan does not change that copy now.
12. **#58 privacy policy.** Closed. Mark (via James, 7:44 AM ET on October 18, 2026) is skipping the lawyer sign-off and publishing the privacy policy. This gate does not launch ratings.
13. **Retention launch.** `DATA_RETENTION_PRODUCTION_LAUNCH` is a code constant in `src/lib/retention-flags.ts`, not an environment variable. It ships false. Before the launch-constant pull request merges, confirm in the Vercel production environment that `DATA_RETENTION_DRY_RUN` is not `off`. If `DATA_RETENTION_PURGE` is `on` and `DATA_RETENTION_DRY_RUN` is `off` already, the first run after the constant flips would write. After Mark's explicit OK, a pull request sets that constant to true and changes nothing else. The first production run is a dry run: `DATA_RETENTION_PURGE` is exactly `on`, and `DATA_RETENTION_DRY_RUN` is left `on` or unset. The code trims whitespace before it matches `on` and `off`, so "exactly" means after that trim. Review those counts. Only then does a separate step set `DATA_RETENTION_DRY_RUN` to exactly `off`. A call before the constant is true returns `enabled: false` and does not open the database. Open.
14. **Sponsorship: #51 P1 re-QA.** Closed. #51 merged at `cac6b83` (main commit `7c58414`). Sentinel QA'd it at `a28b245` and later reported that they diffed the merged `cac6b83` and the sponsor code was unchanged. The reviewer's posted review on #51 is the PASS at `27f6d7ee`.
15. **Sponsorship: live webhook subscribed to refund events.** The three events are `charge.refunded`, `refund.created`, and `refund.updated` (`SPONSOR_REFUND_WEBHOOK_EVENTS` in `src/lib/stripe-webhook.ts` on draft #51). Open.
16. **Sponsorship: refund runbook.** Open.
17. **Sponsorship: newsletter sponsor labels.** Open.
18. **Sponsorship: lawyer question on sponsorship wording.** **Mark-approved.** James relays Mark's note at 7:04 PM ET on October 17, 2026, approving the whole go-live list, including the lawyer review. This gate stays open until the lawyer's signed document is attached.
19. **ADMIN_SPONSORS production launch.** Open. It comes after the A18 Clerk admin test (gate 8).
20. **Mark's OK on #61.** Closed. Mark typed "Merge it" for #61 in James's chat at 7:00 PM ET on October 17, 2026. James relayed that message. The pull request was merged from the `mputiyon1985` account as `dcfb9eb`.
21. **GitHub Actions billing lock.** This is its own gate. The account lock is in Sentinel's QA report in the team QA workspace. It must be cleared before A18, or the e2e jobs and the T10 log-grep step cannot run. Open.
22. **Required status checks on ruleset `25190130`.** Once CI runs, add the required status checks to ruleset `25190130`. Open. Those checks are not set on that ruleset today.
23. **Beehiiv production keys (Sentinel P2 on #52).** James decided on October 17, 2026, at 7:53 PM ET that BestBotFor uses Beehiiv double opt-in. No production Beehiiv keys go in until that double opt-in is enabled, concurrent duplicate signups are deduped to a single Beehiiv call, a per-email signup limit exists, and Turnstile is considered. Open. This gate does not set a key.
24. **Beehiiv pending backfill.** Production migrations `0020` and `0021` were applied by the deploy prebuild; verified read-only after the f8a6236 deploy. The check read `schema_migrations` (prod-verify of `f8a6236`, deploy `dpl_9ZTPJZi9aesSjDVDraYzB1X3LVNP`). The backfill runs only via `--production-launch`, with a dry run first and Mark's OK. Open. This gate does not run the backfill.

**Migrator.** #10 landed on main as `0dfab74`. Main `f8a6236` includes migrations through `0021`. A hand-check of `drizzle/meta/_journal.json` against the SQL files in `drizzle/` matches: 20 tags, idx 0 through 19, one file per tag. `0021_subscriber_beehiiv_status` is idx 19 and `drizzle/0021_subscriber_beehiiv_status.sql` is on disk. `0020_subscriber_syncing_started` is idx 18. There is no `0010` file and no `0010` journal row. This plan does not switch migrators.

Until every gate above is met, the flag has no production branch and production shows nothing.

## 7. Out of MVP (hardening phase, for reference)

Brigading rules and the scheduled job, duplicate-text similarity, a disposable-email blocklist, auto-publish for low-risk reviews, the report threshold to `held`, the audit hash chain and nightly verifier, retention purge jobs (live before the first `ip_hmac` and `net_hmac` values turn 90 days old), JSON export, the sentiment audit and transparency counts, and turning on `SHOW_USER_AGGREGATE_JSONLD` after Rich Results Test validation (spec 13, Phase 2). Step-up reverification for admins moved into MVP (A9) in v1.1.

## 8. Change log

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-10-17 | First plan, written against spec Approved v1.0 (Mark's approval, 2:44 AM ET). Tracks A (A1–A18) and B (S1–S3). |
| v1.1 | 2026-10-17 | Spec v1.1 (status stays Approved). **Track C added:** R1, the sitewide "Our rating" rename (D14), with all 20 places it touches in the repo. **A1 is now delivered in Tony's P3 batch PR**, with his fail-closed flag design: on only for `USER_RATINGS === 'on'` in preview, development or test, or with `VERCEL_ENV` unset and `NODE_ENV` not production; unknown values mean off; gated in middleware and every handler; an e2e job with the flag on. **A1b added** (required HMAC secret and key helper). A18 now adds the production branch behind `USER_RATINGS_PRODUCTION_LAUNCH`, the only way to enable production. Sentinel's 11 gaps folded into A2, A3, A5, A6, A7, A8, A9, A10, A12, A13, A14, A15, A16 and A17. PR #28 and the HMAC secret added as prerequisites. Step-up moved into MVP. Track A is about 17 dev-days. |
| v1.2 | 2026-10-17 | Spec v1.2: **security hardening from Sentinel's review of v1.1. It changes none of Mark's decisions, so no new sign-off is needed.** A1 is written as an explicit opt-in allowlist, with an unset-environment test. A1b now covers the separate `REVIEW_IP_HMAC_SECRET` and the `BBF_E2E_HOOKS` build guard. A3 owns `isVercelDeployment()` and the test-hook guard, and `linkSignals()` returns hints only. A10 hints never change status. A17 archives and greps the `next start` server log in CI ("when reachable" removed) and adds the T25 production-build check. Prerequisites and launch gates updated for the secrets (Production already has `RATE_LIMIT_HMAC_SECRET`; Preview is being set) and for CI running. PR count and sizes unchanged (about 17 dev-days). |
| v1.2.1 | 2026-10-17 | Security patch, no decision change, no new sign-off needed. A1b adds: refusing reused secrets (constant-time compare, values never logged); the key-id regex `^k[1-9][0-9]{0,3}$`; previous id required with the previous secret, which must be at least 32 bytes; `RATE_LIMIT_HMAC_SECRET` at least 32 bytes in production; all at build and boot, with tests. States that no backfill is needed (no review data exists yet) and that A17's CI log artifact holds only synthetic data, kept 7 days. Sizes unchanged. |
| v1.2.2 | 2026-10-17 | Launch gate 1 records the lawyer review (D13) on October 17, 2026, 10:46 AM ET (James, for Mark). Mark confirmed the lawyer reviewed both the #39 drafts and the base policy pages. Scope matches D13: review guidelines and moderation policy, attestation and connection-disclosure wording, Advertiser label text, and the privacy policy and retention changes. Written sign-off: pending link (do not invent a URL). `/privacy`, `/terms`, and `/disclosure` were already indexed on main; this note does not newly index them. `/review-guidelines` and `/how-user-ratings-work` stay noindex until ratings launch. `POLICY_PAGES_LAWYER_APPROVED` is the ratings-not-launched gate for those two pages and stays false. The default-branch ruleset requires a pull request and blocks direct pushes; required status checks are not set. Open gates remain for review-secret rotation (spec 7.2) and Clerk development admin tests. Ratings stay off. |
| v1.2.3 | 2026-10-17 | A1 matches shipped `userRatingsEnabled`: an unset `VERCEL_ENV` is off, and `NODE_ENV` is not consulted. PR #28 is recorded as merged (`2927320`). A18 gates added for Turso auth-token rotation at launch, and for the privacy policy and review guidelines being merged and visible. Internal status text is a launch-checklist item for the ratings launch PR. The live ruleset `25190130` still sets `require_extra_approval_for_unattributed_changes`. |
| v1.2.4 | 2026-10-17 | Sentinel's P2 completeness check. A18 gates added for #58 lawyer packet sign-off; retention launch; every sponsorship gate (#51 P1 re-QA, live webhook subscribed to refund events, refund runbook, newsletter sponsor labels, lawyer question on sponsorship wording); `ADMIN_SPONSORS` production launch after the A18 Clerk admin test; Mark's OK on #61; the GitHub Actions billing lock as its own gate; and required status checks on ruleset `25190130` once CI runs. James decided the required approving review count on `main` stays 0, because with 1 required Mark can't approve his own PRs and merges stall. |
| v1.2.5 | 2026-10-17 | Review of `cf13e71`. Gate 20 does not say Mark's OK on #61 is recorded. James relayed that Mark OK'd #61 around 7 PM ET on October 17, and it was merged from the `mputiyon1985` account as `dcfb9eb`. The pull request has no direct written approval from Mark, so his written confirmation stays open. Gate 13 matches the retention code and runbook: `DATA_RETENTION_PRODUCTION_LAUNCH` is a code constant. After Mark's explicit OK, a pull request sets it to true and nothing else. The first production run is a dry run (`DATA_RETENTION_PURGE` exactly `on`, `DATA_RETENTION_DRY_RUN` left `on` or unset) and those counts are reviewed. A separate step then sets dry-run to exactly `off`. A call before the constant is true returns `enabled: false` and does not open the database. Gate 15 names `charge.refunded`, `refund.created`, and `refund.updated`. A1 notes `USER_RATINGS_PRODUCTION_LAUNCH` is already in the code and is false. |
| v1.2.6 | 2026-10-17 | After #59 merged as `f7ef970`. Gate 13 adds a pre-flip check: before the launch-constant pull request merges, confirm in the Vercel production environment that `DATA_RETENTION_DRY_RUN` is not `off`, or the first run would write if purge is already `on`. The code trims whitespace before matching `on` and `off`, so "exactly" means after that trim. Gate 14 is closed: Sentinel passed the #51 P1 re-QA at `a28b245`. Gate 21 names Sentinel's QA report in the team QA workspace instead of a file path. Gate 20 is closed: Mark typed "Merge it" for #61 in James's chat at 7:00 PM ET on October 17, relayed by James. Gates 1, 2, and 18 are Mark-approved from James's relay of Mark's 7:04 PM ET note approving the whole go-live list, including the lawyer review. Gates 1 and 18 stay open until the lawyer's signed document is attached. Gate 2 closes when the A18 PR merges. Gate 23 is Sentinel's P2 on #52. James decided on October 17, 2026, at 7:53 PM ET that BestBotFor uses Beehiiv double opt-in. No production Beehiiv keys go in until that double opt-in is enabled, concurrent duplicate signups are deduped to a single Beehiiv call, a per-email signup limit exists, and Turnstile is considered. Lawyer-packet questions left open: placement and UTM values sent to Beehiiv, the retention period for newsletter emails, a privacy link at the signup forms, EU/UK opt-in, and the Clerk id kept in sessionStorage. Superseded: do not adopt drizzle-kit's migrator until #10 lands. #10 has landed. The current hand-check is the Migrator paragraph through idx 19. |
| v1.2.7 | 2026-10-18 | Merged main `1dc745a` (the sponsor stack, including #10 as `0dfab74`). Hand-check: `drizzle/meta/_journal.json` tags equal the 17 SQL files, idx 0 through 16. `0009_sponsorships.sql` is on disk at idx 8. There is no `0010` file or journal row. `0018_retention_indexes` is idx 16. This plan does not switch migrators. |
| v1.2.8 | 2026-10-18 | Merged main `f8a6236` (#55, #63, #64, and #65). Hand-check: journal tags equal the SQL files through `0021_subscriber_beehiiv_status` at idx 19 (20 tags, idx 0 through 19). Gate 24: production migrations `0020` and `0021` are already applied. The Beehiiv backfill runs only via `--production-launch`, with a dry run first and Mark's OK. This plan does not switch migrators. |
| v1.2.9 | 2026-10-18 | Review of `188e2a0`. Gate 14 states the record: #51 merged at `cac6b83` (main commit `7c58414`). Sentinel QA'd it at `a28b245` and later reported that they diffed the merged `cac6b83` and the sponsor code was unchanged. The reviewer's posted review on #51 is the PASS at `27f6d7ee`. Gate 2 is Mark-approved via James relay at 7:04 PM ET and closes when the A18 PR is reviewed and merged. The version rows are in order. The v1.2.6 drizzle-kit sentence is superseded. The Migrator paragraph stays the hand-check through idx 19. |
| v1.2.10 | 2026-10-18 | Gate 14 is Closed with that same record. Gate 2 in the v1.2.6 row closes when the A18 PR merges. Gate 24: production migrations `0020` and `0021` were applied by the deploy prebuild; verified read-only after the f8a6236 deploy (`schema_migrations`, prod-verify of `f8a6236`, deploy `dpl_9ZTPJZi9aesSjDVDraYzB1X3LVNP`). |
| v1.2.11 | 2026-10-18 | Mark (via James, 7:44 AM ET) is skipping the lawyer sign-off and publishing the privacy policy. Gate 12 is Closed. Gate 1 no longer waits on a signed lawyer document for that policy. The lawyer-packet question list is removed. |

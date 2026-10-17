# BestBotFor

The right AI in 30 seconds.

BestBotFor asks for the job, the budget, and experience, then names one AI tool and up to six alternatives. The public catalog is free. A membership saves picks and unlocks the longer comparison notes.

A BestBotFor score is an editorial rating from 0 to 5, not a user review. The overall score is quality 40%, features 25%, value 20%, and ease 15%. `SHOW_SCORES` in `src/lib/site.ts` is true, so the v2.3 display is published. Rated tool pages lead with the category rank stored as `category_rank_display`, for example `#3 of 12 in Coding`. When two or more rated tools share a tie group, that line is prefixed `Tied · ` and still shows each tool’s own rank. The rank is omitted when the category has only one rated tool: backend (Supabase), design (Beautiful.ai), games (Inworld), and productivity (Craft). Four bars follow, in order Quality, Features, Value, and Ease. The overall score is secondary and links to `/how-we-rate`. A filled note is shown under the score. Quiz result cards and all-matches cards show the same rank line and overall score, and they do not show the bars. Turning `SHOW_SCORES` off hides the heading, rank, stars, bars, note, and maintenance notice together. Pros and cons stay either way. Pros and cons appear as text only, including on tools v2.3 leaves unrated when those tools already have v1 rows. Evidence and source URL columns are not stored on the score row and are not shown. `src/data/scores-v2.3.csv` is the approved file (91 of 159 tools rated). The seed checks the weighted average and, in one transaction, upserts score rows for those 91 tools. It does not delete a score row unless `SEED_PRUNE=1`. With that flag it deletes every score row for a tool the file does not rate. It upserts pros and cons and does not delete any pros or cons row. The 68 unrated tools hide the score and rank and keep their pros and cons. Cursor and Windsurf take their pros and cons from the v2.3 file. Grok and Semantic Scholar are rated, and their pro and con columns in that file are blank, so those pages have no pros or cons. Windsurf stays at `/tools/windsurf` under the name Devin Desktop (formerly Windsurf). Relevance AI’s free plan is retired, so the catalog upserts `hasFreeTier` as false and Pro at $19 a month billed yearly. Relevance AI is unrated.

Production origin: `https://bestbotfor.com`.

## Setup

Node.js 22 or newer.

```bash
npm ci
cp .env.example .env.local
```

For local development, `TURSO_DATABASE_URL=file:./data/local.db` is enough. `TURSO_AUTH_TOKEN` is required only for a hosted Turso database. `npm run dev` creates the parent directory for a `file:` URL, applies the SQL migrations, and seeds the catalog.

```bash
npm run dev
```

## Environment

| Variable | Purpose |
| --- | --- |
| `TURSO_DATABASE_URL` | `file:` SQLite path, or a `libsql://` Turso URL |
| `TURSO_AUTH_TOKEN` | Single Turso token. Unused for `file:` databases |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin. Defaults to `https://bestbotfor.com` |
| `IP_HASH_SALT` | Optional salt for click-log hashes. Unset means no IP is stored |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk. Both must be set or accounts stay off |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | Stripe test mode for membership. All three are required before membership billing turns on |
| `STRIPE_PRICE_PLACEMENT_WEEKLY`, `STRIPE_PRICE_PLACEMENT_MONTHLY`, `STRIPE_PRICE_NEWSLETTER_SLOT` | One-time sponsor Checkout price ids. Defaults are $99 per week, $299 per month, and $49 per newsletter issue |
| `STRIPE_ALLOW_LIVE` | Default `false`. Live secret keys are refused unless this is the exact value `true`. Going live needs Mark's written approval |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Unused. Hosted Checkout does not send it to the browser |
| `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID` | Optional. Unset stores newsletter emails locally |
| `NEXT_PUBLIC_GA_ID` | Optional GA4 measurement ID. gtag.js loads only after the visitor accepts |
| `GOOGLE_SITE_VERIFICATION` | Optional Search Console token |
| `SEED_PRUNE` | Set to `1` to delete score rows whose tools are not in `src/data/scores-v2.3.csv`. Unset, the seed only upserts |

Stripe billing accepts a test secret key only, unless `STRIPE_ALLOW_LIVE` is set to true after Mark's written approval. CI fails if a live-mode Stripe key prefix, a webhook signing secret, or that flag committed as enabled appears anywhere in the tree. The webhook rejects live-mode events while that flag is off. Point Stripe’s test webhook at `/api/stripe/webhook`.

Sponsor slots are one-time Checkout payments on `/sponsor`: a featured tool slot on a `/best/[task]` page ($99 for a week or $299 for a month) and a newsletter issue ($49). Those are 9900, 29900, and 4900 cents. None of the Prices use a Stripe recurring interval, because Checkout is a single payment rather than a subscription. The sponsor page states “One-time payment, no auto-renewal.” beside each option, and Checkout repeats that line under the pay button. The Stripe product name and the card statement suffix are BestBotFor. List prices live in `src/lib/sponsor-offerings.ts`. Checkout charges the price id from the environment, not a number from the browser. These placements are advertising, so Checkout disables Managed Payments and leaves automatic tax unset. This business stays the merchant of record. After the test secret key is set, `npm run stripe:setup-test` creates those products in test mode, without a Managed Payments tax code, and prints only the price ids. A lookup key that already points at a matching one-time Price is kept, and that Product’s name and statement descriptor are updated to BestBotFor. The Price-create idempotency key includes `one_time`. The script refuses live keys even if the live flag is on. Do not run it against live mode.

`/go/[slug]` redirects to the official URL stored for that tool only when the host is on the reviewed list in the seed. It ignores query strings and affiliate URLs. A rate-limit or catalog timeout still redirects; the click row is written after the response.

`/tools` lists the catalog one page at a time. Filter with `?category=`, for example `/tools?category=coding-assistant`. The deepest benches are coding, writing, images, video, voice, research, and agents. Other jobs, including chat, music, design, and games, have a shorter list.

## Scripts

```bash
npm run lint
npm run typecheck
npm test
npm run check:stripe-keys
npm run check:gitleaks
npm run check:db-writes
npm run check:members
npm run build
npm run test:e2e
npm run stripe:setup-test
```

End-to-end tests build the production server themselves through Playwright. Set `TURSO_DATABASE_URL=file:./data/e2e.db` and `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000` if you run them outside CI.

## Encoded dot segments

`/go/%2e%2e`, `/best/%2e%2e`, and `/compare/%2e%2e` were answering 200 with the home page. Vercel normalizes `%2e` and `..` before Next.js starts, and `new URL()` does the same inside the app, so the proxy never sees the raw path. Patching the global `URL` constructor or `http.Server` caught it only on a Node server we control, and it changed URL parsing for Clerk, Stripe, and libsql.

Two scoped checks replace that:

- `vercel.json` has one route. Its `src` is the incoming pathname, matched on Vercel’s edge before the app, and the response is 404. `next start` does not apply `vercel.json`. The pattern lives in `DOT_SEGMENT_ROUTE_SRC` and the unit tests run it against those paths, plus `/tools/%2e%2e`, mixed forms (`%2E%2E`, `.%2e`, `%2e.`), and ordinary URLs such as `/go/chatgpt` and `/favicon.ico`. That is the edge check we can run without calling production.
- The proxy rejects a raw path when the host still provides one. `npm start` reads `req.url` before Next parses it. That listener is this app’s server only.

After the change is merged and production is deployed, confirm the edge with `curl --path-as-is`. Do not run these from CI. Each status must be `404`. A `200` means the edge still served the home page.

```bash
curl --path-as-is -s -o /dev/null -w '%{http_code}\n' 'https://bestbotfor.com/go/%2e%2e'
curl --path-as-is -s -o /dev/null -w '%{http_code}\n' 'https://bestbotfor.com/best/%2e%2e'
curl --path-as-is -s -o /dev/null -w '%{http_code}\n' 'https://bestbotfor.com/compare/%2e%2e'
curl --path-as-is -s -o /dev/null -w '%{http_code}\n' 'https://bestbotfor.com/tools/%2e%2e'
curl --path-as-is -s -o /dev/null -w '%{http_code}\n' 'https://bestbotfor.com/about/%2e%2e'
curl --path-as-is -s -o /dev/null -w '%{http_code}\n' 'https://bestbotfor.com/go/.%2e'
curl --path-as-is -s -o /dev/null -w '%{http_code}\n' 'https://bestbotfor.com/go/%2E%2E'
curl --path-as-is -s 'https://bestbotfor.com/go/%2e%2e' | head
```

## Deploy

Set the environment variables above on the host. Use a Turso database URL and `TURSO_AUTH_TOKEN`. Set `NEXT_PUBLIC_SITE_URL=https://bestbotfor.com`. Run `npm run build`. The build applies migrations and seeds the catalog before `next build`.

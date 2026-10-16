# BestBotFor

Three questions. One best bot.

BestBotFor asks for the job, the budget, and experience, then names one AI tool and up to six alternatives. The public catalog is free. A membership saves picks and unlocks the longer comparison notes.

A BestBotFor score is an editorial rating from 0 to 5, not a user review. The stars are a weighted average of features (25%), value (25%), ease (20%), and quality (30%). Pros and cons, when we have them, cite the vendor’s own docs or pricing page. Tools without a verified row hide both sections. `src/data/scores-pros-cons.seed.ts` holds the rows that have been checked. The seed validates that file and upserts it in the same transaction as the catalog. It does not delete rows that are absent from the file.

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
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | Stripe test mode. All three are required before billing turns on |
| `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID` | Optional. Unset stores newsletter emails locally |
| `NEXT_PUBLIC_GA_ID` | Optional GA4 measurement ID. gtag.js loads only after the visitor accepts |
| `GOOGLE_SITE_VERIFICATION` | Optional Search Console token |

Stripe billing accepts a test secret key only. CI fails if a live-mode Stripe key prefix appears anywhere in the tree. The webhook rejects live-mode events. Point Stripe’s test webhook at `/api/stripe/webhook`.

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

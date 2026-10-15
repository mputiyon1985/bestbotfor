# BestBotFor

Three questions. One best bot.

BestBotFor asks for the job, the budget, and experience, then names one AI tool and two alternatives. The public catalog is free. A membership saves picks and unlocks the longer comparison notes.

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

## Deploy

Set the environment variables above on the host. Use a Turso database URL and `TURSO_AUTH_TOKEN`. Set `NEXT_PUBLIC_SITE_URL=https://bestbotfor.com`. Run `npm run build`. The build applies migrations and seeds the catalog before `next build`.

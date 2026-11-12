# Private leads page

`/admin/leads` is a password-gated list. The public site does not link to it. Do not add a link, a sitemap entry, or a nav item.

The password is the server env var `BBF_LEADS_PASSWORD`. It is already set on Vercel for production and preview. Unset, empty, whitespace-only, or longer than 256 characters fails closed: the proxy and the page return 404. The check stretches both sides with scrypt (N=16384, r=8, p=1) and compares them with `timingSafeEqual`. The password is not sent to the browser, not put in the cookie, and not written to logs.

The session cookie is HMAC-SHA256 under `BBF_LEADS_SESSION_SECRET`, a separate random secret of at least 32 characters. That secret is not derived from the password. Unset or shorter than 32 characters fails closed with the same 404. Changing the session secret invalidates existing cookies. The cookie is httpOnly, Secure, SameSite=Strict, path `/admin/leads`, and expires after 12 hours, so a copied cookie does not last longer than that.

Each sign-in attempt increments the login `rate_limits` row before the password is compared: 8 per 15 minutes per IP. Import bearer attempts use a separate bucket. The count is taken before the token is compared, and a successful import gives that count back, so only failed bearer attempts stay counted. The stored key is an HMAC, not the address. On Vercel a missing trusted client IP is refused. A database error fails closed.

## Before deploy

Set these on Vercel for production and preview before this deploys. The page 404s without the first two. Bearer import is refused without the third.

- `BBF_LEADS_PASSWORD` is already set. Do not print it.
- `BBF_LEADS_SESSION_SECRET` is required. At least 32 characters. The session HMAC key. Unset or shorter fails closed.
- `BBF_LEADS_IMPORT_TOKEN` is required for bearer import. 32 to 256 characters. Not the page password. Unset refuses `Authorization: Bearer`.

`/admin/sponsors` is unchanged. It still depends on `ADMIN_SPONSORS` and the Clerk admin allowlist. A request is treated as this password gate only when the proxy sets `x-bbf-leads` to the HMAC of the path under the session secret. A client header of `1` does not skip the Clerk admin check.

## Counts

Each lead has one status: `contacted`, `replied`, `affiliate_approved`, `declined`, `bounced`, or `closed`.

| Card | Derivation |
| --- | --- |
| Contacted | Rows whose status is `contacted` |
| Replied | Rows whose status is `replied` |
| Affiliate approvals | Rows whose status is `affiliate_approved` |
| Declines | Rows whose status is `declined` |
| Bounces | Rows whose status is `bounced` |
| $ closed | Sum of `amount_closed_usd` for rows whose status is `closed`. A blank amount counts as $0. Amounts on other statuses are not added. |

The default table order is warm first: replied, then affiliate approvals, then contacted, then closed, then declined, then bounced. Within a status, the latest `last_touch` comes first. Filters do not change the counts.

The page is server-rendered. `Cache-Control` is `private, no-store`. The response also sends `X-Robots-Tag: noindex, nofollow`, and the page metadata is `noindex, nofollow`. Production `robots.txt` already disallows `/admin`, which covers this path. The sitemap does not list it.

## Schema

Migration `drizzle/0032_bbf_leads.sql` (journal idx 30). Main `26a6d4f` (#191) owns `0029` through `0031`, so this is the next file.

Merging applies the migration on deploy, because production and preview builds run `scripts/prepare-db.ts`. Mark's OK is needed before merge. Do not apply it by hand against the production database.

```sql
CREATE TABLE IF NOT EXISTS bbf_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  type TEXT NOT NULL,
  first_contact TEXT,
  last_touch TEXT,
  touches INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  next_step TEXT,
  next_date TEXT,
  notes TEXT,
  amount_closed_usd REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (length(company) BETWEEN 1 AND 200),
  CHECK (length(contact_email) BETWEEN 3 AND 254),
  CHECK (length(type) BETWEEN 1 AND 64),
  CHECK (status IN ('contacted', 'replied', 'affiliate_approved', 'declined', 'bounced', 'closed')),
  CHECK (touches >= 0),
  CHECK (next_step IS NULL OR length(next_step) <= 280),
  CHECK (notes IS NULL OR length(notes) <= 4000),
  CHECK (amount_closed_usd IS NULL OR amount_closed_usd >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS bbf_leads_contact_email_key ON bbf_leads (contact_email);
CREATE INDEX IF NOT EXISTS bbf_leads_status_idx ON bbf_leads (status);
```

`contact_email` is the unique upsert key. The app stores it lowercased. `created_at` and `updated_at` are unix milliseconds. `first_contact`, `last_touch`, and `next_date` are `YYYY-MM-DD` or null. `amount_closed_usd` is dollars with at most two decimal places. `type` is a short label such as `affiliate`, `sponsor`, or `partner`. It does not drive the counts.

## Upsert

Do not commit lead files or real addresses. The examples below use `@example.com`.

A row needs `company`, `contact_email`, `type`, and `status`. Optional fields: `first_contact`, `last_touch`, `touches` (default 0), `next_step`, `next_date`, `notes`, `amount_closed_usd`. An upsert replaces those columns. `created_at` stays on an existing row. `updated_at` becomes the write time. One bad row rejects the whole file. Nothing is written until every row is valid. At most 2000 rows.

JSON is an array, or `{ "rows": [ ... ] }`. CSV needs a header. `contact_email` is also accepted as `contactEmail` in JSON.

```json
[
  {
    "company": "Example Co",
    "contact_email": "ada@example.com",
    "type": "affiliate",
    "status": "replied",
    "first_contact": "2026-11-01",
    "last_touch": "2026-11-10",
    "touches": 2,
    "next_step": "Send the program terms",
    "next_date": "2026-11-20",
    "notes": "Asked for the media kit",
    "amount_closed_usd": null
  }
]
```

```csv
company,contact_email,type,status,first_contact,last_touch,touches,next_step,next_date,notes,amount_closed_usd
Example Co,ada@example.com,affiliate,closed,2026-11-01,2026-11-12,3,None,2026-11-12,Signed,1500
```

### Local file

The script reads `TURSO_DATABASE_URL` and upserts through the database. It does not print addresses. It does not run migrations. It uses the same host guard as migrate and seed, and it also refuses a production host unless you pass `--production-launch`. Do not pass that flag without Mark's OK. This runbook does not run the script against production.

```sh
TURSO_DATABASE_URL=file:./data/local.db npm run leads:upsert -- ./leads.json
```

Validation problems go to stderr as `row N: ...` without the cell value. `row 1` is the first data row. The CSV header is not a row. A good run prints `upserted: N`.

### Signed-in POST

`POST /admin/leads/import` accepts the same JSON or CSV (`Content-Type: application/json` or `text/csv`).

Either of these authorizes the request:

- The `bbf_leads_session` cookie, from a same-origin request.
- `Authorization: Bearer` set to `BBF_LEADS_IMPORT_TOKEN` (32 to 256 characters). This is not the page password. Unset refuses bearer import. Import uses its own rate-limit bucket, not the sign-in bucket. The count is taken before the token is compared and given back when the token matches, so only a wrong bearer stays counted, 8 per 15 minutes per IP. Do not log the header. The body is capped at 1,000,000 bytes actually read. `Content-Length` is not the cap.

The response is `{ "upserted": N }` or `{ "errors": ["row 1: status must be ..."] }`. It does not echo addresses.

```sh
curl -sS -X POST https://bestbotfor.com/admin/leads/import \
  -H "Authorization: Bearer $BBF_LEADS_IMPORT_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @leads.json
```

Keep the token in the environment of that shell. Do not put it in the command history if you can avoid it, and do not paste it into chat or logs.

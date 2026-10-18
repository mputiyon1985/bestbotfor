# Daily Bot newsletter sponsor label

A paid $49 newsletter slot is pasted into the Beehiiv issue from this export. The word Sponsored is added in `src/lib/newsletter-sponsor.ts`. It is not a column on the sponsorship row. The buyer cannot turn it off, and HTML in the company name cannot close the label.

```bash
npm run export:newsletter-sponsor -- 2026-10-21
```

Paste the HTML from stdout into the Beehiiv issue. The export prints the Sponsored label and the company name. It does not print the buyer email. If that date has no paid $49 slot, stdout is empty.

The sponsor's copy goes under the Sponsored label. The sponsor's link goes under that copy. The link is an anchor with `rel="sponsored nofollow"`.

Run the export against production with a read-only token only. Create the token with `turso db tokens create <db> --read-only --expiration 1d`. Put `TURSO_DATABASE_URL` and that read-only `TURSO_AUTH_TOKEN` in `.env.export.local` at the repo root. `.gitignore` covers `.env.*.local`, so the file is not committed; do not use another name such as `.env.export`, which is not ignored. The scripts do not load env files, so load it into the shell first:

```bash
set -a; . ./.env.export.local; set +a
npm run export:newsletter-sponsor -- 2026-10-21
rm .env.export.local
unset TURSO_DATABASE_URL TURSO_AUTH_TOKEN
```

After the export, delete `.env.export.local` and unset both variables, as above. The token expires after 1 day. Turso cannot revoke one database token: `turso db tokens invalidate <db>` rotates every token for the database and its group, including the one production uses, so the site would lose its database until a new token is deployed. Do not run it after a routine export. It is an incident step for a leaked token only, and needs Mark's OK via James.

Do not use a token that can write. Do not paste the token into chat or logs.

A row is included only when the offering is `newsletter_slot`, the status is `paid`, the amount is 4900 cents, the currency is usd or unset, and the row is not refunded. A featured `/best` placement is not included.

Gate 17 is closed on James's CEO OK (2026-10-18).

# Daily Bot newsletter sponsor label

A paid $49 newsletter slot is pasted into the Beehiiv issue from this export. The word Sponsored is added in `src/lib/newsletter-sponsor.ts`. It is not a column on the sponsorship row. The buyer cannot turn it off, and HTML in the company name cannot close the label.

```bash
npm run export:newsletter-sponsor -- 2026-10-21
```

Paste the HTML from stdout into the Beehiiv issue. The export prints the Sponsored label and the company name. It does not print the buyer email. If that date has no paid $49 slot, stdout is empty.

A row is included only when the offering is `newsletter_slot`, the status is `paid`, the amount is 4900 cents, the currency is usd or unset, and the row is not refunded. A featured `/best` placement is not included.

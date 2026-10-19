# Backlog

Small follow-ups that are not scheduled yet. Each line names who raised it and where.

## Tests

- **Brittle heading assertions in `e2e/sponsor.spec.ts`.** The "sponsor pages send no catalog Price env names" test checks the raw HTML for `<h1 class="font-bold text-5xl">Sponsor</h1>` and `<h2 class="font-semibold text-2xl">Tool card</h2>`, Tailwind classes included, so a styling-only class change fails it. Match the tag and text with a class-agnostic regex (for example `/<h1[^>]*>Sponsor<\/h1>/`) instead. Raised by Sentinel in the #95 QA (non-blocking).
- **Stripe e2e mock should record session retrieves.** `scripts/stripe-e2e-mock.ts` records only `POST /v1/checkout/sessions`, so a future `GET /v1/checkout/sessions/:id` from `/sponsor/success` would not be caught by the "no Stripe call" test. Record every request path and method, and assert `/sponsor/success` makes none. Raised by Sentinel in the #95 QA (non-blocking).

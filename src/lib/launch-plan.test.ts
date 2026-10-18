import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const plan = readFileSync(path.join(process.cwd(), 'docs/specs/user-ratings-mvp-build-plan.md'), 'utf8')
const changelog = readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8')

describe('ratings launch plan', () => {
  it('matches the shipped flag and records PR #28 as merged', () => {
    expect(plan).toContain('An unset or unknown `VERCEL_ENV` is off. `NODE_ENV` is not consulted.')
    expect(plan).not.toContain('When it is unset, `NODE_ENV` is used')
    expect(plan).not.toContain('Until it lands')
    expect(plan).toContain('**PR #28: shared rate window. Merged** as `2927320`')
    expect(plan).toContain('false whenever `VERCEL_ENV` is unset')
  })

  it('adds the A18 gates and leaves internal status text for the launch PR', () => {
    expect(plan).toContain('**Turso token rotation at launch.**')
    expect(plan).toContain('This gate does not rotate a token.')
    expect(plan).toContain('**Privacy policy and review guidelines merged and visible**')
    expect(plan).toContain('Open until those guidelines are visible.')
    expect(plan).toContain('**Launch checklist: internal status text.**')
    expect(plan).toContain('This plan does not change that copy now.')
    expect(plan).toContain('`require_extra_approval_for_unattributed_changes` is still true on this ruleset.')
    expect(plan).toContain("James decided the required approving review count on `main` stays 0.")
    expect(plan).toContain("With 1 required, Mark can't approve his own PRs and merges stall.")
  })

  it('lists the P2 completeness gates before A18', () => {
    expect(plan).toContain('**#58 privacy policy.** Closed. Mark (via James, 7:44 AM ET on October 18, 2026) is skipping the lawyer sign-off and publishing the privacy policy. This gate does not launch ratings.')
    expect(plan).not.toContain('**#58 lawyer packet sign-off.**')
    expect(plan).not.toContain('needs sign-off before A18')
    expect(plan).not.toContain('**Lawyer packet questions (open).**')
    expect(plan).toContain('`DATA_RETENTION_PRODUCTION_LAUNCH` is a code constant in `src/lib/retention-flags.ts`, not an environment variable.')
    expect(plan).toContain('After Mark\'s explicit OK, a pull request sets that constant to true and changes nothing else.')
    expect(plan).toContain('The first production run is a dry run: `DATA_RETENTION_PURGE` is exactly `on`, and `DATA_RETENTION_DRY_RUN` is left `on` or unset.')
    expect(plan).toContain('Only then does a separate step set `DATA_RETENTION_DRY_RUN` to exactly `off`.')
    expect(plan).toContain('A call before the constant is true returns `enabled: false` and does not open the database.')
    expect(plan).toContain('Before the launch-constant pull request merges, confirm in the Vercel production environment that `DATA_RETENTION_DRY_RUN` is not `off`.')
    expect(plan).toContain('If `DATA_RETENTION_PURGE` is `on` and `DATA_RETENTION_DRY_RUN` is `off` already, the first run after the constant flips would write.')
    expect(plan).toContain('The code trims whitespace before it matches `on` and `off`, so "exactly" means after that trim.')
    expect(plan).not.toContain('one deploy')
    expect(plan).not.toContain('DATA_RETENTION_PRODUCTION_LAUNCH=true')
    for (const gate of [
      '**Sponsorship: #51 P1 re-QA.**',
      '**Sponsorship: live webhook subscribed to refund events.**',
      '`charge.refunded`, `refund.created`, and `refund.updated`',
      '**Sponsorship: refund runbook.**',
      '**Sponsorship: newsletter sponsor labels.**',
      '**Sponsorship wording.** Closed. Mark (via James) dropped the lawyer requirement at 7:44 AM ET on October 18, 2026. Sponsor wording gets internal review only.',
    ]) {
      expect(plan).toContain(gate)
    }
    expect(plan).toContain('**Sponsorship: #51 P1 re-QA.** Closed. #51 merged at `cac6b83` (main commit `7c58414`). Sentinel QA\'d it at `a28b245` and later reported that they diffed the merged `cac6b83` and the sponsor code was unchanged. The reviewer\'s posted review on #51 is the PASS at `27f6d7ee`.')
    expect(plan).toContain('**ADMIN_SPONSORS production launch.**')
    expect(plan).toContain('It comes after the A18 Clerk admin test (gate 8).')
    expect(plan).toContain('**Mark\'s OK on #61.** Closed. Mark typed "Merge it" for #61 in James\'s chat at 7:00 PM ET on October 17, 2026. James relayed that message.')
    expect(plan).not.toContain("Mark's written confirmation stays an open gate item.")
    expect(plan).not.toContain('Recorded as given')
    expect(plan).not.toContain('**Sponsorship: lawyer question on sponsorship wording.**')
    expect(plan).not.toContain('lawyer-review copy')
    expect(plan).toContain('### A15: Policy and content pages (internal-review copy)')
    expect(plan).toContain('| A15 | Policy and content pages (internal-review copy) |')
    expect(plan).not.toContain("This gate stays open until the lawyer's signed document is attached.")
    expect(plan).not.toContain("lawyer's sign-off")
    const liveGates = plan.slice(plan.indexOf('## 6. Launch gates'), plan.indexOf('## 7. Out of MVP'))
    expect(liveGates).toContain('**Policy review (D13).** Closed. Mark (via James) dropped the lawyer requirement at 7:44 AM ET on October 18, 2026.')
    expect(liveGates).not.toContain('stays open until')
    expect(plan).toContain('2. **Mark approves** the final copy and the A18 PR. Mark-approved via James relay at 7:04 PM ET; closes when the A18 PR is reviewed and merged.')
    expect(plan).not.toContain('2. **Mark approves** the final copy and the A18 PR. **Mark-approved.** Closed.')
    expect(plan).not.toContain('qa-pr29-30.md')
    expect(plan).toContain("Sentinel's QA report in the team QA workspace.")
    expect(plan).toContain('`USER_RATINGS_PRODUCTION_LAUNCH` is already in the code and is false. A18 sets that constant to true.')
    expect(plan).not.toContain('arrive only in A18')
    expect(plan).toContain('**GitHub Actions billing lock.** This is its own gate.')
    expect(plan).toContain('**Required status checks on ruleset `25190130`.** Once CI runs, add the required status checks to ruleset `25190130`.')
    expect(plan).toContain('**Beehiiv production keys (Sentinel P2 on #52).**')
    expect(plan).toContain('James decided on October 17, 2026, at 7:53 PM ET that BestBotFor uses Beehiiv double opt-in.')
    expect(plan).toContain('No production Beehiiv keys go in until that double opt-in is enabled, concurrent duplicate signups are deduped to a single Beehiiv call, a per-email signup limit exists, and Turnstile is considered.')
    expect(plan).not.toContain('our own confirm step')
    expect(plan).toContain('**Beehiiv pending backfill.** Production migrations `0020` and `0021` were applied by the deploy prebuild; verified read-only after the f8a6236 deploy. The check read `schema_migrations` (prod-verify of `f8a6236`, deploy `dpl_9ZTPJZi9aesSjDVDraYzB1X3LVNP`). The backfill runs only via `--production-launch`, with a dry run first and Mark\'s OK. Open. This gate does not run the backfill.')
    expect(plan).not.toContain('__drizzle_migrations')
    expect(changelog).toContain('verified read-only after the f8a6236 deploy (`schema_migrations`, prod-verify of `f8a6236`, deploy `dpl_9ZTPJZi9aesSjDVDraYzB1X3LVNP`)')
    expect(changelog).not.toContain('__drizzle_migrations')
    expect(plan).not.toContain('Gate 2 is closed')
    expect(changelog).not.toContain('Gate 2 is closed')
    expect(changelog).toContain('Gate 2 closes when the A18 PR merges.')
    for (const question of [
      'placement and UTM values sent to Beehiiv',
      'the retention period for newsletter emails',
      'a privacy link at the signup forms',
      'EU/UK opt-in',
      'the Clerk id kept in sessionStorage',
    ]) {
      expect(plan).toContain(question)
    }
    const migrator = plan.slice(plan.indexOf('**Migrator.**'), plan.indexOf('Until every gate above is met'))
    expect(migrator).toContain('20 tags, idx 0 through 19, one file per tag')
    expect(migrator).toContain('`0021_subscriber_beehiiv_status` is idx 19')
    expect(migrator).toContain('`drizzle/0021_subscriber_beehiiv_status.sql` is on disk')
    expect(migrator).toContain('`0020_subscriber_syncing_started` is idx 18')
    expect(migrator).toContain('There is no `0010` file and no `0010` journal row.')
    expect(migrator).toContain('This plan does not switch migrators.')
    expect(migrator).not.toContain('is not on this branch')
    expect(migrator).not.toContain('orphan journal row')
    const versionTable = plan.slice(plan.indexOf('| v1.0 |'))
    expect(versionTable.indexOf('| v1.2.6 |')).toBeLessThan(versionTable.indexOf('| v1.2.7 |'))
    expect(versionTable.indexOf('| v1.2.7 |')).toBeLessThan(versionTable.indexOf('| v1.2.8 |'))
    expect(versionTable.indexOf('| v1.2.8 |')).toBeLessThan(versionTable.indexOf('| v1.2.9 |'))
    expect(versionTable.indexOf('| v1.2.9 |')).toBeLessThan(versionTable.indexOf('| v1.2.10 |'))
    expect(versionTable.indexOf('| v1.2.10 |')).toBeLessThan(versionTable.indexOf('| v1.2.11 |'))
    expect(versionTable.indexOf('| v1.2.11 |')).toBeLessThan(versionTable.indexOf('| v1.2.12 |'))
    expect(versionTable.indexOf('| v1.2.12 |')).toBeLessThan(versionTable.indexOf('| v1.2.13 |'))
    expect(versionTable.indexOf('| v1.2.13 |')).toBeLessThan(versionTable.indexOf('| v1.2.14 |'))
    const v1210 = versionTable.slice(versionTable.indexOf('| v1.2.10 |'), versionTable.indexOf('| v1.2.11 |'))
    expect(v1210).toContain('verified read-only after the f8a6236 deploy (`schema_migrations`, prod-verify of `f8a6236`, deploy `dpl_9ZTPJZi9aesSjDVDraYzB1X3LVNP`)')
    expect(v1210).not.toContain('__drizzle_migrations')
    const v1211 = versionTable.slice(versionTable.indexOf('| v1.2.11 |'), versionTable.indexOf('| v1.2.12 |'))
    expect(v1211).toContain('Gate 12 is Closed.')
    const versionRow = (version: string) => versionTable.split('\n').find((line) => line.startsWith(`| ${version} |`)) ?? ''
    const v1212 = versionRow('v1.2.12')
    expect(v1212).toContain('Gate 18 is Closed.')
    const v1214 = versionRow('v1.2.14')
    expect(v1214).toContain('Gate 15 is Closed.')
    expect(v1214).toContain('Gate 16 is Closed.')
    expect(v1214).toContain("Tony's Stripe API read-back at 2:31:12 PM ET")
    expect(v1214).toContain('`we_1URwkHIJUbygfAucFVXA9X0z`')
    expect(v1214).toContain('`STRIPE_ALLOW_LIVE` is `true` in Production, set after Mark approved go-live on 2026-10-18.')
    expect(v1214).toContain("James (CEO) OK'd it on 2026-10-18")
    expect(liveGates).toContain('15. **Sponsorship: live webhook subscribed to refund events.** Closed.')
    expect(liveGates).toContain('The live endpoint is `POST /api/stripe/webhook`.')
    const gate15 = liveGates.slice(liveGates.indexOf('15. **Sponsorship: live webhook'), liveGates.indexOf('16. **Sponsorship: refund runbook.**'))
    expect(gate15).toContain('Evidence dated 2026-10-18')
    expect(gate15).toContain('the read-back at 2:31:12 PM ET shows live endpoint `we_1URwkHIJUbygfAucFVXA9X0z` pointing at `https://bestbotfor.com/api/stripe/webhook`')
    expect(gate15).toContain('It is subscribed to 16 events')
    for (const event of ['charge.refunded', 'refund.created', 'refund.updated', 'invoice.paid', 'invoice.payment_failed', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed', 'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated']) {
      expect(gate15, event).toContain(`\`${event}\``)
    }
    expect(gate15).toContain('`STRIPE_ALLOW_LIVE` is `true` in Production only, set after Mark approved go-live on 2026-10-18.')
    expect(liveGates).toContain('16. **Sponsorship: refund runbook.** Closed. James (CEO) OK\'d it on 2026-10-18: "Gates 15 and 16: ship the docs PR today."')
    expect(liveGates).toContain('`/admin/sponsors` opens in preview, development, and test when `ADMIN_SPONSORS` is `on`, and returns 404 in production until gate 19.')
    expect(liveGates).toContain('A status flip alone does not publish a card.')
    const runbook = readFileSync(path.join(process.cwd(), 'docs/runbooks/sponsor-reject-refund.md'), 'utf8')
    expect(runbook).toContain('The live endpoint is `POST /api/stripe/webhook`.')
    for (const event of [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'charge.refunded',
      'refund.created',
      'refund.updated',
    ]) {
      expect(runbook).toContain(`\`${event}\``)
    }
    // The runbook has to match the code: the preview queue, the approved snapshot, the two refund records, and the expiry trigger.
    expect(runbook).toContain('`/admin/sponsors` opens in preview, development, and test when `ADMIN_SPONSORS` is `on`')
    expect(runbook).toContain('In production the page returns 404 until gate 19')
    expect(runbook).not.toContain('Do not use that page')
    expect(runbook).toContain('Find the payment in the Stripe dashboard')
    expect(runbook).toContain('Mark-approved production write, coordinated by James')
    for (const column of ['approved_tool_name', 'approved_description', 'approved_url', 'approved_logo_mime', 'approved_logo_bytes', 'approved_content_hash', 'approved_version']) {
      expect(runbook).toContain(`\`${column}\``)
    }
    expect(runbook).toContain('Setting `status` to `approved` on its own does not publish anything.')
    expect(runbook).toContain('`sponsorship_review_events`')
    expect(runbook).toContain('The webhook does not touch the card\'s `refund_status` or `sponsorship_refund_events`.')
    expect(runbook).toContain('only where the row\'s id matches and `refund_status` is `refund_pending`')
    expect(runbook).toContain('The 7-day expiry has no clock or scheduled job of its own.')
    expect(runbook).not.toContain('Operators do not open `/admin/sponsors` for that load.')
    expect(runbook).not.toMatch(/whsec_|we_[A-Za-z0-9]/)
    expect(runbook).toContain('A blank reason is stored as "Refunded in the Stripe dashboard."')
    expect(runbook).toContain('The route returns 400 (`live-mode-rejected`) for every live-mode event unless `VERCEL_ENV` is exactly `production` and `STRIPE_ALLOW_LIVE` is exactly `true`.')
    const paymentLinks = runbook.slice(runbook.indexOf('## Payment Link sales'), runbook.indexOf('## Card rules'))
    for (const heading of ['### Fulfillment', '### Refunds and cancellations', '### The 6-month price lock', '### Disputes']) {
      expect(paymentLinks, heading).toContain(heading)
    }
    expect(paymentLinks).toContain('`plink_1URylTIJUbygfAuc07cebXfn`')
    expect(paymentLinks).toContain('`plink_1URyeXIJUbygfAucnLlkSP5u`')
    expect(paymentLinks).toContain('`best_page`')
    expect(paymentLinks).toContain('They create no `sponsorships` row')
    expect(paymentLinks).toContain('`recordSponsorCardReview`')
    expect(paymentLinks).toContain("needs Mark's OK, via James")
    // Sentinel re-QA d471dbd: the manual row, the slot check, buyer PII, and the label.
    for (const field of ['`stripe_checkout_session_id`', '`stripe_payment_intent_id`', '`placement_weekly` or `placement_monthly`', '`status`: `paid`', '`paid_at`', '`task_slug`: the task from `best_page`']) {
      expect(paymentLinks, field).toContain(field)
    }
    expect(paymentLinks).toContain('a dashboard refund of that payment intent sets `refunded_at` and hides the placement automatically')
    expect(paymentLinks).not.toContain('a Payment Link sale has no such row')
    expect(paymentLinks).toContain('A Payment Link sale does not reserve the `/best` slot.')
    expect(paymentLinks).toContain('Also check `sponsorship_slot_claims` for an unexpired `/sponsor` claim on that task')
    expect(paymentLinks).toContain('A subscription Checkout session has no payment intent of its own, so take the `pi_…` from that period\'s invoice payment')
    expect(liveGates).toContain("James's condition: gate 16 closes once the fixed runbook passes Sentinel's re-QA, and he merges this PR only on that PASS.")
    const exportRunbook = readFileSync(path.join(process.cwd(), 'docs/runbooks/newsletter-sponsor-label.md'), 'utf8')
    expect(exportRunbook).toContain('`.env.export.local`')
    expect(exportRunbook).toContain('set -a; . ./.env.export.local; set +a')
    expect(exportRunbook).toContain('turso db tokens create <db> --read-only --expiration 1d')
    expect(exportRunbook).toContain('rm .env.export.local')
    expect(exportRunbook).toContain('After the export, delete `.env.export.local` and unset both variables')
    expect(exportRunbook).toContain('Do not run it after a routine export.')
    const readme = readFileSync(path.join(process.cwd(), 'README.md'), 'utf8')
    expect(readme).not.toContain('A succeeded or partial refund hides the placement.')
    expect(readme).toContain('Any of those that reports a succeeded or partial refund hides the placement.')
    expect(readme.split('Refunds are still issued by hand in the Stripe dashboard.')).toHaveLength(2)
    expect(paymentLinks).toContain('Refer to a sale only by its Stripe object id (`cs_…`, `pi_…`, or `sub_…`).')
    expect(paymentLinks).toContain('Never paste the buyer\'s email, name, or address into Slack, chat, tickets, the repo, or the launch plan.')
    expect(paymentLinks).toContain('That is what gives it the "Sponsored" label on `/best` and puts it under `/disclosure`.')
    expect(paymentLinks).toContain('Never feature a sponsor by editing catalog data, rankings, or page copy.')
    expect(paymentLinks).toContain('30 days for `placement_monthly`')
    expect(paymentLinks).not.toContain('one month for `placement_monthly`')
    expect(paymentLinks).toContain('both Payment Link sales and `/sponsor` Checkout sales')
    expect(runbook).toContain('They still write and finish a `stripe_events` idempotency row, but change no sponsorship or membership data.')
    const v1213 = versionRow('v1.2.13')
    expect(v1213).toContain('Gate 17 is Closed.')
    expect(liveGates).toContain('17. **Sponsorship: newsletter sponsor labels.** Closed on James\'s CEO OK (2026-10-18).')
    expect(liveGates).toContain('`rel="sponsored nofollow"`')
    expect(liveGates).toContain('read-only token only')
    expect(liveGates).toContain('`docs/runbooks/newsletter-sponsor-label.md`')
    expect(v1213).toContain('James\'s CEO OK (2026-10-18)')
    expect(v1212).toContain('Mark (via James) dropped the lawyer requirement at 7:44 AM ET on October 18, 2026.')
    expect(v1212).toContain('Sponsor wording gets internal review only.')
    expect(changelog).not.toContain('needs lawyer review before merge')
    expect(changelog).not.toContain('lawyer packet sign-off')
    expect(changelog).not.toContain('Open lawyer-packet questions')
    expect(changelog).toContain('Mark (via James) dropped the lawyer requirement at 7:44 AM ET on October 18, 2026. Sponsor wording gets internal review only.')
    expect(changelog).not.toContain('The written sign-off is a pending link.')
    expect(changelog).not.toContain('lawyer question on sponsorship wording')
    const v126 = versionTable.slice(versionTable.indexOf('| v1.2.6 |'), versionTable.indexOf('| v1.2.7 |'))
    expect(v126).toContain('Gate 2 closes when the A18 PR merges.')
    expect(v126).not.toContain('Gate 2 is closed')
    expect(v126).toContain('Superseded: do not adopt drizzle-kit\'s migrator until #10 lands.')
    expect(v126).toContain('The current hand-check is the Migrator paragraph through idx 19.')
  })
})

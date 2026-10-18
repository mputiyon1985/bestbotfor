import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const plan = readFileSync(path.join(process.cwd(), 'docs/specs/user-ratings-mvp-build-plan.md'), 'utf8')

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
    expect(plan).toContain('**#58 lawyer packet sign-off.**')
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
      '**Sponsorship: lawyer question on sponsorship wording.**',
    ]) {
      expect(plan).toContain(gate)
    }
    expect(plan).toContain('**Sponsorship: #51 P1 re-QA.** Closed. Sentinel passed the #51 P1 re-QA at `a28b245`.')
    expect(plan).toContain('**ADMIN_SPONSORS production launch.**')
    expect(plan).toContain('It comes after the A18 Clerk admin test (gate 8).')
    expect(plan).toContain('**Mark\'s OK on #61.** Closed. Mark typed "Merge it" for #61 in James\'s chat at 7:00 PM ET on October 17, 2026. James relayed that message.')
    expect(plan).not.toContain("Mark's written confirmation stays an open gate item.")
    expect(plan).not.toContain('Recorded as given')
    expect(plan).toContain('**Mark-approved.** James relays Mark\'s note at 7:04 PM ET on October 17, 2026, approving the whole go-live list, including the lawyer review.')
    expect(plan).toContain('This gate stays open until the lawyer\'s signed document is attached.')
    expect(plan).toContain('2. **Mark approves** the final copy and the A18 PR. **Mark-approved.** Closed.')
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
    expect(migrator).toContain('17 tags, idx 0 through 16, one file per tag')
    expect(migrator).toContain('`drizzle/0009_sponsorships.sql` is on disk')
    expect(migrator).toContain('There is no `0010` file and no `0010` journal row.')
    expect(migrator).toContain('`0018_retention_indexes` is idx 16.')
    expect(migrator).toContain('This plan does not switch migrators.')
    expect(migrator).not.toContain('is not on this branch')
    expect(migrator).not.toContain('orphan journal row')
  })
})

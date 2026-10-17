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
    expect(plan).toContain('**ADMIN_SPONSORS production launch.**')
    expect(plan).toContain('It comes after the A18 Clerk admin test (gate 8).')
    expect(plan).toContain('James relayed that Mark OK\'d #61 around 7 PM ET on October 17, 2026, and it was merged from the `mputiyon1985` account as `dcfb9eb`.')
    expect(plan).toContain('The pull request itself has no direct written approval from Mark.')
    expect(plan).toContain("Mark's written confirmation stays an open gate item.")
    expect(plan).not.toContain('Recorded as given')
    expect(plan).toContain('`USER_RATINGS_PRODUCTION_LAUNCH` is already in the code and is false. A18 sets that constant to true.')
    expect(plan).not.toContain('arrive only in A18')
    expect(plan).toContain('**GitHub Actions billing lock.** This is its own gate.')
    expect(plan).toContain('**Required status checks on ruleset `25190130`.** Once CI runs, add the required status checks to ruleset `25190130`.')
  })
})

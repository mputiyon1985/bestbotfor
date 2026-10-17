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
    expect(plan).toContain("Mark's explicit OK, then a dry-run first, then one deploy setting `DATA_RETENTION_PRODUCTION_LAUNCH=true`, `DATA_RETENTION_PURGE` on, and `DATA_RETENTION_DRY_RUN` off.")
    for (const gate of [
      '**Sponsorship: #51 P1 re-QA.**',
      '**Sponsorship: live webhook subscribed to refund events.**',
      '**Sponsorship: refund runbook.**',
      '**Sponsorship: newsletter sponsor labels.**',
      '**Sponsorship: lawyer question on sponsorship wording.**',
    ]) {
      expect(plan).toContain(gate)
    }
    expect(plan).toContain('**ADMIN_SPONSORS production launch.**')
    expect(plan).toContain('It comes after the A18 Clerk admin test (gate 8).')
    expect(plan).toContain("**Mark's OK on #61.** Recorded as given. James merged #61 as `dcfb9eb`.")
    expect(plan).toContain('**GitHub Actions billing lock.** This is its own gate.')
    expect(plan).toContain('**Required status checks on ruleset `25190130`.** Once CI runs, add the required status checks to ruleset `25190130`.')
  })
})

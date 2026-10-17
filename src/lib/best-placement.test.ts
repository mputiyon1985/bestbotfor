import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SponsoredPlacement } from '@/components/sponsored-placement'
import { sponsorships } from './db/schema'
import { createTestDatabase } from '@/test/db'
import { SPONSORSHIP_DISCLOSURE } from './sponsorship-disclosure'
import {
  SPONSORED_LABEL,
  activeBestPlacement,
  activeBestPlacementForTask,
  type SponsorshipPlacementRow,
} from './best-placement'

const START = 1_700_000_000_000
const WEEK = 7 * 24 * 60 * 60 * 1000
const MONTH = 30 * 24 * 60 * 60 * 1000

function row(overrides: Partial<SponsorshipPlacementRow> = {}): SponsorshipPlacementRow {
  return {
    offering: 'placement_weekly',
    status: 'paid',
    taskSlug: 'coding',
    company: 'Example Tools',
    updatedAt: START,
    ...overrides,
  }
}

describe('activeBestPlacement', () => {
  it('returns a Sponsored placement only while a paid guide sponsorship is active', () => {
    const rows = [
      row(),
      row({ offering: 'placement_monthly', company: 'Older Co', updatedAt: START - 1 }),
      row({ status: 'pending', company: 'Pending Co' }),
      row({ status: 'failed', company: 'Failed Co' }),
      row({ offering: 'newsletter_slot', company: 'Issue Co' }),
      row({ taskSlug: 'writing', company: 'Other Task' }),
      row({ taskSlug: null, company: 'No Task' }),
    ]
    expect(activeBestPlacement(rows, 'coding', START)).toEqual({
      label: 'Sponsored',
      company: 'Example Tools',
      offering: 'placement_weekly',
    })
    expect(activeBestPlacement(rows, 'coding', START + WEEK - 1)?.company).toBe('Example Tools')
    expect(activeBestPlacement(rows, 'coding', START + WEEK)).toEqual({
      label: 'Sponsored',
      company: 'Older Co',
      offering: 'placement_monthly',
    })
    expect(activeBestPlacement(rows, 'coding', START - 1 + MONTH)).toBeNull()
    expect(activeBestPlacement(rows, 'writing', START)).toEqual({
      label: 'Sponsored',
      company: 'Other Task',
      offering: 'placement_weekly',
    })
    expect(activeBestPlacement([], 'coding', START)).toBeNull()
  })

  it('drops a blank company name and still labels the placement', () => {
    expect(activeBestPlacement([row({ company: '   ' })], 'coding', START)).toEqual({
      label: SPONSORED_LABEL,
      company: null,
      offering: 'placement_weekly',
    })
  })
})

describe('SponsoredPlacement', () => {
  it('renders the Sponsored label for an active placement and nothing otherwise', () => {
    const shown = renderToStaticMarkup(
      createElement(SponsoredPlacement, {
        placement: { label: SPONSORED_LABEL, company: 'Example Tools', offering: 'placement_weekly' },
      }),
    )
    expect(shown).toContain('Sponsored')
    expect(shown).toContain('Example Tools paid for a featured placement')
    expect(shown).toContain('href="/disclosure"')
    expect(renderToStaticMarkup(createElement(SponsoredPlacement, { placement: null }))).toBe('')
  })

  it('renders the label when the sponsorship has no company name', () => {
    const shown = renderToStaticMarkup(
      createElement(SponsoredPlacement, {
        placement: { label: SPONSORED_LABEL, company: null, offering: 'placement_monthly' },
      }),
    )
    expect(shown).toContain('Sponsored')
    expect(shown).toContain('A company paid for a featured placement')
  })
})

describe('activeBestPlacementForTask', () => {
  it('reads a paid row and ignores one that is not active', async () => {
    const { db, close } = await createTestDatabase()
    await db.insert(sponsorships).values([
      {
        stripeCheckoutSessionId: 'cs_paid',
        offering: 'placement_weekly',
        status: 'paid',
        company: 'Example Tools',
        taskSlug: 'coding',
        createdAt: START,
        updatedAt: START,
      },
      {
        stripeCheckoutSessionId: 'cs_pending',
        offering: 'placement_weekly',
        status: 'pending',
        company: 'Pending Co',
        taskSlug: 'coding',
        createdAt: START,
        updatedAt: START,
      },
    ])
    await expect(activeBestPlacementForTask(db, 'coding', START)).resolves.toMatchObject({
      label: 'Sponsored',
      company: 'Example Tools',
    })
    await expect(activeBestPlacementForTask(db, 'coding', START + WEEK)).resolves.toBeNull()
    await expect(activeBestPlacementForTask(db, 'writing', START)).resolves.toBeNull()
    await close()
  })
})

describe('sponsorship disclosure', () => {
  it('states the paid products and the Sponsored label', () => {
    expect(SPONSORSHIP_DISCLOSURE).toContain('paid featured placements')
    expect(SPONSORSHIP_DISCLOSURE).toContain('newsletter sponsorships')
    expect(SPONSORSHIP_DISCLOSURE).toContain('labeled Sponsored')
    expect(SPONSORSHIP_DISCLOSURE).toContain('newsletter sponsorship is labeled Sponsored')
  })
})

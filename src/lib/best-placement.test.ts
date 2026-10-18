import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SponsoredPlacement } from '@/components/sponsored-placement'
import type { Database } from './db/client'
import { sponsorships } from './db/schema'
import { createTestDatabase } from '@/test/db'
import { SPONSORSHIP_DISCLOSURE } from './sponsorship-disclosure'
import {
  SPONSORED_LABEL,
  activeBestPlacement,
  activeBestPlacementForTask,
  readActiveBestPlacement,
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
    paidAt: START,
    refundedAt: null,
    ...overrides,
  }
}

describe('activeBestPlacement', () => {
  it('returns a Sponsored placement only while a paid guide sponsorship is active', () => {
    const rows = [
      row(),
      row({ offering: 'placement_monthly', company: 'Older Co', paidAt: START - 1 }),
      row({ status: 'pending', company: 'Pending Co' }),
      row({ status: 'failed', company: 'Failed Co' }),
      row({ offering: 'newsletter_slot', company: 'Issue Co' }),
      row({ taskSlug: 'writing', company: 'Other Task' }),
      row({ taskSlug: null, company: 'No Task' }),
      row({ paidAt: null, company: 'Unstamped' }),
      row({ refundedAt: START, company: 'Refunded Co' }),
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

  it('counts the window from paidAt and hides a refund even when that time is inside the window', () => {
    const weekly = row({ paidAt: START })
    expect(activeBestPlacement([weekly], 'coding', START + WEEK - 1)?.company).toBe('Example Tools')
    expect(activeBestPlacement([weekly], 'coding', START + WEEK)).toBeNull()
    expect(activeBestPlacement([row({ refundedAt: START + 10 })], 'coding', START + 11)).toBeNull()
  })

  it('drops a blank company name and still labels the placement', () => {
    expect(activeBestPlacement([row({ company: '   ' })], 'coding', START)).toEqual({
      label: SPONSORED_LABEL,
      company: null,
      offering: 'placement_weekly',
    })
  })

  it('strips bidi and control characters from the published company name', () => {
    const shown = activeBestPlacement(
      [row({ company: '\u202EExample\u0000 Tools\u2066' })],
      'coding',
      START,
    )
    expect(shown?.company).toBe('Example Tools')
    expect(shown?.company).not.toContain('\u202E')
  })
})

describe('SponsoredPlacement', () => {
  it('renders the Sponsored label for an active placement and nothing otherwise', () => {
    const shown = renderToStaticMarkup(
      createElement(SponsoredPlacement, {
        placement: { label: SPONSORED_LABEL, company: 'Example Tools', offering: 'placement_weekly' },
      }),
    )
    expect(shown).toContain('<h2 id="sponsored-placement-heading"')
    expect(shown).toContain('border-t')
    expect(shown).toContain('Sponsored')
    expect(shown).toContain('Example Tools paid for a featured placement')
    expect(shown).toContain('href="/disclosure"')
    expect(shown).toContain('Disclosures')
    expect(shown).not.toContain('Affiliate disclosure')
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

  it('strips bidi characters again at render', () => {
    const shown = renderToStaticMarkup(
      createElement(SponsoredPlacement, {
        placement: {
          label: SPONSORED_LABEL,
          company: 'Acme\u202E Tools',
          offering: 'placement_weekly',
        },
      }),
    )
    expect(shown).toContain('Acme Tools paid for a featured placement')
    expect(shown).not.toContain('\u202E')
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
        updatedAt: START + WEEK,
        paidAt: START,
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

  it('does not show a refunded row', async () => {
    const { db, close } = await createTestDatabase()
    await db.insert(sponsorships).values({
      stripeCheckoutSessionId: 'cs_refunded',
      offering: 'placement_monthly',
      status: 'paid',
      company: 'Refunded Co',
      taskSlug: 'coding',
      createdAt: START,
      updatedAt: START,
      paidAt: START,
      refundedAt: START + 1,
    })
    await expect(activeBestPlacementForTask(db, 'coding', START + 2)).resolves.toBeNull()
    await close()
  })
})

describe('readActiveBestPlacement', () => {
  it('renders no box when the sponsorship query throws and logs no buyer data', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = {
      select() {
        return {
          from() {
            return {
              where() {
                return Promise.reject(new Error('no such table: sponsorships sponsor@example.com Example Tools'))
              },
            }
          },
        }
      },
    } as unknown as Database
    await expect(readActiveBestPlacement(() => db, 'coding', START)).resolves.toBeNull()
    await expect(
      readActiveBestPlacement(() => {
        throw new Error('sponsor@example.com Example Tools')
      }, 'coding', START),
    ).resolves.toBeNull()
    expect(errorLog).toHaveBeenCalledWith('best placement lookup failed', 'Error')
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('sponsor@example.com')
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('Example Tools')
    errorLog.mockRestore()
  })
})

describe('sponsorship disclosure', () => {
  it('states the paid products and the Sponsored label', () => {
    expect(SPONSORSHIP_DISCLOSURE).toContain('paid featured placements')
    expect(SPONSORSHIP_DISCLOSURE).toContain('newsletter sponsorships')
    expect(SPONSORSHIP_DISCLOSURE).toContain('labeled Sponsored')
    expect(SPONSORSHIP_DISCLOSURE).toContain('newsletter sponsorship is labeled Sponsored')
  })

  it('names the page and the links Disclosures', () => {
    const files = [
      'src/app/disclosure/page.tsx',
      'src/components/sponsored-placement.tsx',
      'src/components/site-footer.tsx',
      'src/app/tools/[slug]/page.tsx',
      'src/app/result/page.tsx',
      'src/app/llms.txt/route.ts',
    ]
    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8')
      expect(source.toLowerCase()).not.toContain('affiliate disclosure')
    }
    const page = readFileSync(path.join(process.cwd(), 'src/app/disclosure/page.tsx'), 'utf8')
    expect(page).toContain('>Disclosures</h1>')
    expect(page).toContain("title: 'Disclosures'")
  })
})

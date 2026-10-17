import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SponsoredPlacement } from '@/components/sponsored-placement'
import type { Database } from './db/client'
import { sponsorshipCreatives, sponsorships } from './db/schema'
import type { PublicSponsorCard } from './sponsor-card'
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
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const CARD: PublicSponsorCard = {
  name: 'Widget',
  description: 'A useful coding tool.',
  url: 'https://example.com/widget',
  logoSrc: `data:image/png;base64,${PNG.toString('base64')}`,
}

function row(overrides: Partial<SponsorshipPlacementRow> = {}): SponsorshipPlacementRow {
  return {
    id: 1,
    offering: 'placement_weekly',
    status: 'paid',
    taskSlug: 'coding',
    company: 'Example Tools',
    paidAt: START,
    refundedAt: null,
    card: CARD,
    ...overrides,
  }
}

async function storeCard(db: Database, sponsorshipId: number, status: string) {
  await db.insert(sponsorshipCreatives).values({
    sponsorshipId,
    toolName: 'Widget',
    description: 'A useful coding tool.',
    url: 'https://example.com/widget',
    logoMime: 'image/png',
    logoBytes: PNG,
    status,
    contentHash: 'a'.repeat(64),
    version: 1,
    approvedToolName: status === 'approved' ? 'Widget' : null,
    approvedDescription: status === 'approved' ? 'A useful coding tool.' : null,
    approvedUrl: status === 'approved' ? 'https://example.com/widget' : null,
    approvedLogoMime: status === 'approved' ? 'image/png' : null,
    approvedLogoBytes: status === 'approved' ? PNG : null,
    approvedContentHash: status === 'approved' ? 'a'.repeat(64) : null,
    approvedVersion: status === 'approved' ? 1 : null,
    createdAt: START,
    updatedAt: START,
  })
}

describe('activeBestPlacement', () => {
  it('returns a Sponsored placement only while a paid guide sponsorship is active', () => {
    const rows = [
      row(),
      row({ id: 2, offering: 'placement_monthly', company: 'Older Co', paidAt: START - 1 }),
      row({ status: 'pending', company: 'Pending Co' }),
      row({ status: 'failed', company: 'Failed Co' }),
      row({ offering: 'newsletter_slot', company: 'Issue Co' }),
      row({ id: 3, taskSlug: 'writing', company: 'Other Task' }),
      row({ taskSlug: null, company: 'No Task' }),
      row({ paidAt: null, company: 'Unstamped' }),
      row({ refundedAt: START, company: 'Refunded Co' }),
    ]
    expect(activeBestPlacement(rows, 'coding', START)).toEqual({
      label: 'Sponsored',
      company: 'Example Tools',
      offering: 'placement_weekly',
      sponsorshipId: 1,
      card: CARD,
    })
    expect(activeBestPlacement(rows, 'coding', START + WEEK - 1)?.company).toBe('Example Tools')
    expect(activeBestPlacement(rows, 'coding', START + WEEK)).toEqual({
      label: 'Sponsored',
      company: 'Older Co',
      offering: 'placement_monthly',
      sponsorshipId: 2,
      card: CARD,
    })
    expect(activeBestPlacement(rows, 'coding', START - 1 + MONTH)).toBeNull()
    expect(activeBestPlacement(rows, 'writing', START)).toEqual({
      label: 'Sponsored',
      company: 'Other Task',
      offering: 'placement_weekly',
      sponsorshipId: 3,
      card: CARD,
    })
    expect(activeBestPlacement([], 'coding', START)).toBeNull()
    expect(activeBestPlacement([row({ id: undefined })], 'coding', START)).toBeNull()
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
      sponsorshipId: 1,
      card: CARD,
    })
  })

  it('hides a paid placement until the tool card is attached', () => {
    expect(activeBestPlacement([row({ card: null })], 'coding', START)).toBeNull()
    expect(activeBestPlacement([row({ card: undefined })], 'coding', START)).toBeNull()
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
        placement: { label: SPONSORED_LABEL, company: 'Example Tools', offering: 'placement_weekly', sponsorshipId: 1, card: CARD },
      }),
    )
    expect(shown).toContain('<h2 id="sponsored-placement-heading"')
    expect(shown).toContain('border-t')
    expect(shown).toContain('Sponsored')
    expect(shown).toContain('Example Tools paid for a featured placement')
    expect(shown).toContain('href="/go/s/1"')
    expect(shown).not.toContain('href="https://example.com/widget"')
    expect(shown).toContain('rel="sponsored nofollow"')
    expect(shown).toContain('Widget')
    expect(shown).toContain('A useful coding tool.')
    expect(shown).toContain('href="/disclosure"')
    expect(shown).toContain('Disclosures')
    expect(shown).not.toContain('Affiliate disclosure')
    expect(shown).not.toContain('aria-label="Tools ranked')
    expect(renderToStaticMarkup(createElement(SponsoredPlacement, { placement: null }))).toBe('')
  })

  it('renders the label when the sponsorship has no company name', () => {
    const shown = renderToStaticMarkup(
      createElement(SponsoredPlacement, {
        placement: { label: SPONSORED_LABEL, company: null, offering: 'placement_monthly', sponsorshipId: 1, card: CARD },
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
          sponsorshipId: 1,
          card: CARD,
        },
      }),
    )
    expect(shown).toContain('Acme Tools paid for a featured placement')
    expect(shown).not.toContain('\u202E')
  })

  it('escapes the card text and drops a non-https URL', () => {
    const shown = renderToStaticMarkup(
      createElement(SponsoredPlacement, {
        placement: {
          label: SPONSORED_LABEL,
          company: 'Example Tools',
          offering: 'placement_weekly',
          sponsorshipId: 1,
          card: { ...CARD, name: '<script>alert(1)</script>', description: 'A useful coding tool.' },
        },
      }),
    )
    expect(shown).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(shown).not.toContain('<script>')
    expect(shown).toContain('rel="sponsored nofollow"')
    const dropped = renderToStaticMarkup(
      createElement(SponsoredPlacement, {
        placement: {
          label: SPONSORED_LABEL,
          company: 'Example Tools',
          offering: 'placement_weekly',
          sponsorshipId: 1,
          card: { ...CARD, url: 'javascript:alert(1)' },
        },
      }),
    )
    expect(dropped).toBe('')
  })

  it('is rendered above the editorial ranking and is not part of the ItemList', () => {
    const page = readFileSync(path.join(process.cwd(), 'src/app/best/[task]/page.tsx'), 'utf8')
    const box = page.indexOf('<SponsoredPlacement')
    const list = page.indexOf('<ul aria-label={listLabel}')
    expect(box).toBeGreaterThan(-1)
    expect(list).toBeGreaterThan(box)
    expect(page).toContain('itemListJsonLd(bestGuideListName(task.name), `/best/${task.slug}`, shown)')
    expect(page).not.toContain('placement.card')
  })
})

describe('activeBestPlacementForTask', () => {
  it('reads a paid row and ignores one that is not active', async () => {
    const { db, close } = await createTestDatabase()
    const inserted = await db
      .insert(sponsorships)
      .values([
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
      .returning({ id: sponsorships.id, session: sponsorships.stripeCheckoutSessionId })
    const paid = inserted.find((item) => item.session === 'cs_paid')
    if (!paid) throw new Error('missing paid row')
    await expect(activeBestPlacementForTask(db, 'coding', START)).resolves.toBeNull()
    await storeCard(db, paid.id, 'pending')
    await expect(activeBestPlacementForTask(db, 'coding', START)).resolves.toBeNull()
    await storeCard(db, paid.id, 'rejected')
    await expect(activeBestPlacementForTask(db, 'coding', START)).resolves.toBeNull()
    await storeCard(db, paid.id, 'approved')
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
    const inserted = await db
      .insert(sponsorships)
      .values({
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
      .returning({ id: sponsorships.id })
    const refunded = inserted[0]
    if (!refunded) throw new Error('missing refunded row')
    await storeCard(db, refunded.id, 'approved')
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

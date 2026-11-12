import { describe, expect, it } from 'vitest'
import { filterLeads, leadSummary, sortLeads, warmRank, type LeadRow } from '@/lib/leads/model'

function row(overrides: Partial<LeadRow> & Pick<LeadRow, 'id' | 'status'>): LeadRow {
  return {
    company: 'Example Co',
    contactEmail: 'ada@example.com',
    type: 'affiliate',
    firstContact: '2026-11-01',
    lastTouch: '2026-11-02',
    touches: 1,
    nextStep: null,
    nextDate: null,
    notes: null,
    amountClosedUsd: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('lead summary', () => {
  it('counts each status and sums closed dollars only', () => {
    const summary = leadSummary([
      { status: 'contacted', amountClosedUsd: 40 },
      { status: 'replied', amountClosedUsd: null },
      { status: 'replied', amountClosedUsd: 5 },
      { status: 'affiliate_approved', amountClosedUsd: null },
      { status: 'declined', amountClosedUsd: null },
      { status: 'bounced', amountClosedUsd: null },
      { status: 'bounced', amountClosedUsd: 9 },
      { status: 'closed', amountClosedUsd: 0.1 },
      { status: 'closed', amountClosedUsd: 0.2 },
      { status: 'closed', amountClosedUsd: null },
      { status: 'closed', amountClosedUsd: 0 },
      { status: 'other', amountClosedUsd: 100 },
    ])
    expect(summary).toEqual({
      contacted: 1,
      replied: 2,
      affiliateApprovals: 1,
      declines: 1,
      bounces: 2,
      closedCount: 4,
      closedUsd: 0.3,
    })
    expect(leadSummary([]).closedUsd).toBe(0)
  })
})

describe('lead order', () => {
  it('lists warm leads first and then filters without changing that order', () => {
    const rows = [
      row({ id: 1, status: 'bounced', company: 'Bounce Co', contactEmail: 'bounce@example.com', lastTouch: '2026-11-09' }),
      row({ id: 2, status: 'contacted', company: 'New Co', contactEmail: 'new@example.com', lastTouch: '2026-11-03' }),
      row({ id: 3, status: 'replied', company: 'Warm Co', contactEmail: 'warm@example.com', lastTouch: '2026-11-01' }),
      row({ id: 4, status: 'affiliate_approved', company: 'Yes Co', contactEmail: 'yes@example.com', lastTouch: '2026-11-08' }),
      row({ id: 5, status: 'declined', company: 'No Co', contactEmail: 'no@example.com', lastTouch: '2026-11-07' }),
      row({ id: 6, status: 'closed', company: 'Paid Co', contactEmail: 'paid@example.com', amountClosedUsd: 10, lastTouch: '2026-11-06' }),
      row({ id: 7, status: 'replied', company: 'Later Co', contactEmail: 'later@example.com', lastTouch: '2026-11-11' }),
    ]
    expect(warmRank('replied')).toBeLessThan(warmRank('affiliate_approved'))
    expect(warmRank('affiliate_approved')).toBeLessThan(warmRank('contacted'))
    expect(warmRank('contacted')).toBeLessThan(warmRank('closed'))
    expect(warmRank('closed')).toBeLessThan(warmRank('declined'))
    expect(warmRank('declined')).toBeLessThan(warmRank('bounced'))
    const sorted = sortLeads(rows, { sort: 'warm', dir: 'asc', status: '', type: '', q: '' })
    expect(sorted.map((entry) => entry.id)).toEqual([7, 3, 4, 2, 6, 5, 1])

    const filtered = sortLeads(filterLeads(rows, { sort: 'warm', dir: 'asc', status: 'replied', type: '', q: 'co' }), {
      sort: 'warm',
      dir: 'asc',
      status: 'replied',
      type: '',
      q: 'co',
    })
    expect(filtered.map((entry) => entry.contactEmail)).toEqual(['later@example.com', 'warm@example.com'])

    const byAmount = sortLeads(rows, { sort: 'amount', dir: 'desc', status: '', type: '', q: '' })
    expect(byAmount[0]?.id).toBe(6)
    expect(byAmount.at(-1)?.amountClosedUsd).toBeNull()
  })
})

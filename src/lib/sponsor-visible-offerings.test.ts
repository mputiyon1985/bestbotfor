import { describe, expect, it } from 'vitest'
import { visibleSponsorOfferings } from './sponsor-visible-offerings'

const base = [
  { id: 'placement_weekly', available: false },
  { id: 'placement_subscription', available: false },
  { id: 'founding_sponsor', available: false, soldOut: true },
]

describe('sponsor form offerings', () => {
  it('hides the monthly subscription while it is not configured and leaves the rest alone', () => {
    expect(visibleSponsorOfferings(base).map((o) => o.id)).toEqual(['placement_weekly', 'founding_sponsor'])
  })

  it('shows the monthly subscription again once it is configured', () => {
    const configured = base.map((o) => (o.id === 'placement_subscription' ? { ...o, available: true } : o))
    expect(visibleSponsorOfferings(configured).map((o) => o.id)).toEqual(['placement_weekly', 'placement_subscription', 'founding_sponsor'])
  })

  it('never hides the founding offer, sold out or not configured', () => {
    const founding = [{ id: 'founding_sponsor', available: false }]
    expect(visibleSponsorOfferings(founding)).toEqual(founding)
  })
})

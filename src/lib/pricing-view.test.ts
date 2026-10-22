import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MEMBERS_COMING_SOON_COPY, pricingView } from './pricing-view'

describe('/pricing view', () => {
  it('shows members coming soon only when no membership price is configured', () => {
    expect(pricingView({ available: false, reason: 'unconfigured' })).toBe('coming-soon')
    expect(pricingView({ available: false, reason: 'unavailable' })).toBe('unavailable')
    expect(pricingView({ available: true })).toBe('price')
  })

  it('uses the honest coming-soon copy with the newsletter signup and no buy-style copy', () => {
    expect(MEMBERS_COMING_SOON_COPY).toBe('Members: coming soon. Join The Daily Bot to hear first.')
    const source = readFileSync(path.join(process.cwd(), 'src/app/pricing/page.tsx'), 'utf8')
    const branch = source.slice(source.indexOf('if (!pricing.configured)'), source.indexOf('const { founding }'))
    expect(branch).toContain('<NewsletterForm')
    expect(branch).toContain('MEMBERS_COMING_SOON_COPY')
    expect(branch).not.toMatch(/checkout|subscribe|Sign in/i)
    expect(source).not.toContain('Membership billing is not available yet')
  })
})

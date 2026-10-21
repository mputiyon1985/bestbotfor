import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createElement as h } from 'react'
import { AffiliateDisclosure } from '@/components/affiliate-disclosure'

describe('AffiliateDisclosure', () => {
  it('says "Affiliate link" only when an affiliate URL is set', () => {
    const on = renderToStaticMarkup(h(AffiliateDisclosure, { affiliate: true, vendor: 'Acme' }))
    expect(on).toContain('Affiliate link')
    expect(on).toContain('may earn a commission')
    const off = renderToStaticMarkup(h(AffiliateDisclosure, { affiliate: false, vendor: 'Acme' }))
    expect(off).not.toContain('Affiliate link:')
    expect(off).toContain('not an affiliate link')
    expect(renderToStaticMarkup(h(AffiliateDisclosure, { affiliate: false }))).toBe('')
  })
  it('renders inline-safe markup (no <p>), so it can sit inside a paragraph next to the button', () => {
    expect(renderToStaticMarkup(h(AffiliateDisclosure, { affiliate: true }))).not.toContain('<p')
  })
})

describe('trust copy', () => {
  const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
  it('How We Rate no longer claims links earn a commission today', () => {
    expect(read('src/content/how-we-rate.md')).not.toContain('Some links earn us a commission')
  })
  it('the Visit link is rel="sponsored" only for affiliate links', () => {
    expect(read('src/components/outbound-link.tsx')).toContain("rel={affiliate ? 'sponsored nofollow noopener' : 'nofollow noopener'}")
  })
  it('FAQ, About and Disclosures describe the near-button note', () => {
    for (const p of ['src/app/page.tsx', 'src/app/about/page.tsx', 'src/app/disclosure/page.tsx']) {
      expect(read(p)).toMatch(/note (next to|right next to) (it|them) says so|“Affiliate link” note right next to them/)
    }
  })
})

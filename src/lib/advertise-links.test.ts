import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), 'utf8')
}

describe('advertise links', () => {
  it('adds Advertise to the header and keeps Sponsor in the footer', () => {
    const header = source('src/components/site-header.tsx')
    expect(header).toContain("{ href: '/sponsor', label: 'Advertise' }")
    const footer = source('src/components/site-footer.tsx')
    expect(footer).toContain('href="/sponsor">Sponsor</Link>')
    expect(footer).not.toContain('Advertise')
  })

  it('offers a labeled sponsor invitation on best guides, separate from the paid placement', () => {
    const page = source('src/app/best/[task]/page.tsx')
    expect(page).toContain('<SponsorPageCta taskSlug={task.slug} />')
    expect(page).not.toContain('Feature your tool here')
    const cta = source('src/components/sponsor-page-cta.tsx')
    expect(cta).toContain('Sponsor this page')
    expect(cta).toContain('Get featured here')
    expect(cta).toContain('sponsorPageHref')
    expect(cta).not.toContain('bg-mist')
    expect(cta).not.toContain("'use client'")
    expect(source('src/components/sponsored-placement.tsx')).not.toContain('Sponsor this page')
    expect(source('src/components/sponsored-placement.tsx')).not.toContain('Get featured here')
  })
})

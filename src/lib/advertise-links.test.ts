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

  it('offers a quiet feature note on best guides without a sponsored label', () => {
    const page = source('src/app/best/[task]/page.tsx')
    const note = page.slice(page.indexOf('Feature your tool here') - 120, page.indexOf('Feature your tool here') + 40)
    expect(note).toContain('href="/sponsor"')
    expect(note).toContain('text-sm text-muted')
    expect(note).not.toContain('Sponsored')
    expect(note).not.toContain('bg-mist')
    expect(source('src/components/sponsored-placement.tsx')).not.toContain('Feature your tool here')
  })
})

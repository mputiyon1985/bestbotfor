import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAND, OG_IMAGE_PATH, ORGANIZATION_LOGO_PATH } from './brand'
import { organizationJsonLd } from './jsonld'
import { getSiteUrl, TAGLINE } from './site'

describe('brand sheet palette', () => {
  it('keeps the five named swatches in the theme', () => {
    const css = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8')
    expect(css).toContain(BRAND.indigo)
    expect(css).toContain(BRAND.mint)
    expect(css).toContain(BRAND.ink)
    expect(css).toContain(BRAND.white)
    expect(css).toContain(BRAND.softIndigo)
    expect(css).toContain('Poppins')
    expect(css).not.toContain('#1b4332')
    expect(css).not.toContain('Fraunces')
    expect(css).not.toContain('Source Sans')
  })

  it('uses the approved tagline and the kit open graph image', () => {
    expect(TAGLINE).toBe('Three questions. One best bot.')
    expect(OG_IMAGE_PATH).toBe('/og/og-default-1200x630.png')
    const manifest = readFileSync(path.join(process.cwd(), 'public/site.webmanifest'), 'utf8')
    expect(manifest).toContain(BRAND.indigo)
    expect(manifest).toContain(BRAND.ink)
    expect(manifest).toContain('/maskable-512.png')
    expect(manifest).toContain('Three questions. One best bot.')
  })

  it('points organization structured data at the kit icon', () => {
    expect(organizationJsonLd().logo).toBe(`${getSiteUrl()}${ORGANIZATION_LOGO_PATH}`)
  })
})

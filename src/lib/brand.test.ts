import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { decompress } from 'wawoff2'
import {
  BRAND,
  HASHED_ASSET_PATHS,
  MASKABLE_ICON_PATH,
  OG_HEADLINE_TEMPLATE_PATH,
  OG_IMAGE_PATH,
  OG_IMAGE_SVG_PATH,
  ORGANIZATION_LOGO_PATH,
} from './brand'
import { organizationJsonLd } from './jsonld'
import { homeTitle } from './metadata'
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
    expect(css).toContain("font-family: bbf-metric, ui-sans-serif, system-ui, sans-serif")
    expect(css).toContain('size-adjust: 116.97%')
    const layout = readFileSync(path.join(process.cwd(), 'src/app/layout.tsx'), 'utf8')
    expect(layout).toContain('var(--font-poppins),bbf-metric,ui-sans-serif,system-ui,sans-serif')
    expect(css).not.toContain('#1b4332')
    expect(css).not.toContain('Fraunces')
    expect(css).not.toContain('Source Sans')
  })

  it('uses the approved tagline and the kit open graph image', () => {
    expect(TAGLINE).toBe('The right AI in 30 seconds.')
    expect(homeTitle).toBe('BestBotFor | The right AI in 30 seconds')
    expect(OG_IMAGE_PATH).toBe('/og/og-default-1200x630.676bae0e.png')
    expect(OG_IMAGE_SVG_PATH).toBe('/og/og-default-1200x630.1ab473e6.svg')
    expect(existsSync(path.join(process.cwd(), 'public', OG_HEADLINE_TEMPLATE_PATH.replace(/^\/+/, '')))).toBe(true)
    const manifest = readFileSync(path.join(process.cwd(), 'public/site.webmanifest'), 'utf8')
    expect(manifest).toContain(BRAND.indigo)
    expect(manifest).toContain(BRAND.ink)
    expect(manifest).toContain(MASKABLE_ICON_PATH)
    expect(manifest).toContain('The right AI in 30 seconds.')
  })

  it('keeps hashed brand files, woff2 fonts, and drops the ttf and screenshot copies', async () => {
    for (const asset of HASHED_ASSET_PATHS) {
      expect(asset).toMatch(/\.[0-9a-f]{8}\.(png|svg)$/)
      expect(existsSync(path.join(process.cwd(), 'public', asset.replace(/^\/+/, '')))).toBe(true)
    }
    const fonts = path.join(process.cwd(), 'src/fonts')
    for (const weight of ['Regular', 'Medium', 'SemiBold', 'Bold']) {
      expect(existsSync(path.join(fonts, `Poppins-${weight}.woff2`))).toBe(true)
      expect(existsSync(path.join(fonts, `Poppins-${weight}.ttf`))).toBe(false)
    }
    expect(existsSync(path.join(fonts, 'OFL.txt'))).toBe(true)
    expect(existsSync(path.join(process.cwd(), 'docs/screenshots'))).toBe(false)
    const decoded = Buffer.from(await decompress(readFileSync(path.join(fonts, 'Poppins-Bold.woff2'))))
    expect(decoded.subarray(0, 4).toString('hex')).toBe('00010000')
  })

  it('points organization structured data at the kit icon', () => {
    const organization = organizationJsonLd()
    expect(organization.logo).toBe(`${getSiteUrl()}${ORGANIZATION_LOGO_PATH}`)
    expect(organization.slogan).toBe(TAGLINE)
    expect(organization.description).toContain(TAGLINE)
  })
})

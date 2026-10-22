import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { organizationJsonLd } from './jsonld'
import { BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_E164, BUSINESS_PHONE_HREF, IMPACT_SITE_VERIFICATION } from './site'

const repo = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url))

describe('business phone and Impact verification', () => {
  it('uses the exact number', () => {
    expect(BUSINESS_PHONE_DISPLAY).toBe('(571) 279-8182')
    expect(BUSINESS_PHONE_E164).toBe('+15712798182')
    expect(BUSINESS_PHONE_HREF).toBe('tel:+15712798182')
  })
  it('adds telephone to Organization JSON-LD', () => {
    expect(organizationJsonLd().telephone).toBe('+15712798182')
  })
  it('renders the footer and about phone links', () => {
    for (const f of ['src/components/site-footer.tsx', 'src/app/about/page.tsx']) {
      const src = readFileSync(repo(f), 'utf8')
      expect(src).toContain('href={BUSINESS_PHONE_HREF}')
      expect(src).toContain('{BUSINESS_PHONE_DISPLAY}')
    }
  })
  it('emits the Impact tag with value=, not content=', () => {
    expect(IMPACT_SITE_VERIFICATION).toBe('2b9bb46d-ab24-4ccc-a8a5-93db997140b6')
    const layout = readFileSync(repo('src/app/layout.tsx'), 'utf8')
    expect(layout).toContain('<meta name="impact-site-verification" {...IMPACT_META_ATTRS} />')
    expect(layout).toContain('{ value: IMPACT_SITE_VERIFICATION }')
  })
})

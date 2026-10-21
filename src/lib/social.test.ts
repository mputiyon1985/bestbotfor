import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SOCIAL_LINK_REL, SOCIAL_LINKS } from './social'

describe('footer social links', () => {
  it('lists the three BestBotFor profiles', () => {
    expect(SOCIAL_LINKS.map((link) => link.href)).toEqual([
      'https://www.facebook.com/profile.php?id=61595073856208',
      'https://x.com/bestbotfor',
      'https://www.linkedin.com/company/bestbotfor',
    ])
    for (const link of SOCIAL_LINKS) expect(link.label).toContain(link.name)
    expect(SOCIAL_LINK_REL).toBe('noopener me')
  })

  it('renders them in a labeled footer nav, same tab like the rest of the site', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/components/site-footer.tsx'), 'utf8')
    expect(source).toContain('aria-label="Follow BestBotFor"')
    expect(source).toContain('rel={SOCIAL_LINK_REL}')
    expect(source).toContain('aria-label={link.label}')
    expect(source).not.toContain('target=')
    expect(source).not.toContain('twitter:site')
  })
})

describe('social icons', () => {
  it('renders inline SVG icon links with aria-labels, rel="noopener me", never sponsored, no external images', async () => {
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { SocialIconRow } = await import('@/components/social-icons')
    const html = renderToStaticMarkup(createElement(SocialIconRow))
    for (const link of SOCIAL_LINKS) {
      expect(html).toContain(`href="${link.href.replace(/&/g, '&amp;')}" rel="noopener me" aria-label="${link.label}"`)
    }
    expect(html.match(/<svg /g)).toHaveLength(3)
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(3)
    expect(html).not.toMatch(/sponsored|<img|xlink:href|url\(|target=/)
  })

  it('appears in the footer, mobile nav and About page', () => {
    const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')
    expect(read('src/components/site-footer.tsx')).toContain('<SocialIcon name={link.name} />')
    expect(read('src/components/site-header.tsx')).toContain('<SocialIconRow />')
    expect(read('src/app/about/page.tsx')).toContain('<SocialIconRow')
  })
})

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

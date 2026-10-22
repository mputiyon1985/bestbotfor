import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { faqJsonLd, itemListJsonLd, jsonLdScript } from './jsonld'

const read = (p: string) => readFileSync(p, 'utf8')

describe('structured data on /best, /compare and /tools', () => {
  it('each page emits ItemList and, where FAQs are shown, FAQPage', () => {
    expect(read('src/app/best/page.tsx')).toMatch(/<JsonLd data=\{itemList\}/)
    for (const p of ['src/app/best/[task]/page.tsx', 'src/app/best/[task]/free/page.tsx', 'src/app/compare/[pair]/page.tsx']) {
      const src = read(p)
      expect(src, p).toContain('itemListJsonLd(')
      expect(src, p).toContain('faqJsonLd(faqs)')
    }
    expect(read('src/app/tools/page.tsx')).toContain('itemListJsonLd(')
  })

  it('never emits ratings or Review JSON-LD (score-visibility policy)', () => {
    for (const p of ['src/app/best/page.tsx', 'src/app/best/[task]/page.tsx', 'src/app/compare/[pair]/page.tsx', 'src/app/tools/page.tsx', 'src/app/tools/[slug]/page.tsx']) {
      expect(read(p), p).not.toMatch(/aggregateRating|ratingValue|reviewRating|'Review'/)
    }
    const list = jsonLdScript(itemListJsonLd('AI tools', '/tools', [{ name: 'Cursor', slug: 'cursor' }]))
    const faq = jsonLdScript(faqJsonLd([{ question: 'Q?', answer: 'A.' }]))
    for (const out of [list, faq]) expect(out).not.toMatch(/aggregateRating|ratingValue|reviewRating|"Review"/)
    expect(list).toContain('"@type":"ItemList"')
    expect(list).toContain('/tools/cursor')
  })
})

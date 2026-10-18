import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPARE_DIGEST_FINE_PRINT, compareCopy } from '@/data/compare-copy'
import { NEWSLETTER_BUTTON_LABEL } from '@/components/newsletter-form'
import { NEWSLETTER_SIGNUP_PARAGRAPH } from '@/lib/privacy-copy'

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

const SIGNUP_LINE = 'Free AI newsletter, first issue coming soon. Unsubscribe anytime.'

/** Cadence words, after the product name is removed. "The Daily Bot" is the name, not a schedule. */
const CADENCE = /\b(weekday|weekdays|each day|every day|a day|per day|this week|daily)\b/i

function withoutProductName(text: string): string {
  return text.replaceAll('The Daily Bot', '').replaceAll('Daily Bot', '').replaceAll('daily-bot', '')
}

describe('newsletter signup copy', () => {
  it('asks for The Daily Bot and does not promise a weekday or daily issue', () => {
    expect(NEWSLETTER_BUTTON_LABEL).toBe('Get The Daily Bot')
    expect(COMPARE_DIGEST_FINE_PRINT).toBe(SIGNUP_LINE)
    expect(source('src/components/newsletter-form.tsx')).toContain('NEWSLETTER_BUTTON_LABEL')
    expect(source('src/components/newsletter-form.tsx')).not.toContain('Get the daily digest')
    const newsletterPage = source('src/app/newsletter/page.tsx')
    expect(newsletterPage).toContain(SIGNUP_LINE)
    const loadoutPage = source('src/app/ai-loadout/page.tsx')
    expect(loadoutPage).toContain('Free AI newsletter, first issue coming soon.')
    for (const text of [
      COMPARE_DIGEST_FINE_PRINT,
      source('src/components/daily-bot-capture.tsx'),
      source('src/components/newsletter-form.tsx'),
      newsletterPage,
      loadoutPage,
      NEWSLETTER_SIGNUP_PARAGRAPH,
      ...compareCopy.map((entry) => entry.cta),
    ]) {
      expect(withoutProductName(text)).not.toMatch(CADENCE)
    }
    expect(compareCopy.map((entry) => entry.cta).join('\n')).not.toContain('5-minute')
    expect(source('src/lib/privacy-copy.ts')).not.toMatch(/\bweekday/i)
    expect(source('src/data/compare-copy.ts')).not.toMatch(/\b(weekday|each day)\b/i)
  })

  it('ships the AI Loadout PDF with a real document title', () => {
    // The page text is compressed, so cadence in the PDF is checked with pdftotext when it is re-exported.
    const pdf = readFileSync(path.join(process.cwd(), 'public/ai-loadout.pdf')).toString('latin1')
    expect(pdf).not.toContain('.render.html')
    expect(pdf).toContain('/Title (The AI Loadout: the best bot for all 17 jobs | BestBotFor)')
  })
})

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPARE_DIGEST_FINE_PRINT } from '@/data/compare-copy'
import { NEWSLETTER_BUTTON_LABEL } from '@/components/newsletter-form'
import { NEWSLETTER_SIGNUP_PARAGRAPH } from '@/lib/privacy-copy'

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('newsletter signup copy', () => {
  it('asks for The Daily Bot and does not promise a weekday issue yet', () => {
    expect(NEWSLETTER_BUTTON_LABEL).toBe('Get The Daily Bot')
    expect(COMPARE_DIGEST_FINE_PRINT).toBe('Free AI newsletter, first issue coming soon. Unsubscribe anytime.')
    expect(source('src/components/newsletter-form.tsx')).toContain('NEWSLETTER_BUTTON_LABEL')
    expect(source('src/components/newsletter-form.tsx')).not.toContain('Get the daily digest')
    expect(source('src/components/daily-bot-capture.tsx')).not.toMatch(/weekday/i)
    expect(source('src/app/newsletter/page.tsx')).not.toMatch(/weekday/i)
    expect(source('src/app/newsletter/page.tsx')).toContain('Free AI newsletter, first issue coming soon.')
    expect(NEWSLETTER_SIGNUP_PARAGRAPH).not.toMatch(/weekday/i)
    expect(source('src/lib/privacy-copy.ts')).not.toMatch(/weekday/i)
  })
})

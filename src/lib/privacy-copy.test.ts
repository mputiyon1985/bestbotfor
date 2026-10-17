import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { OG_RATE_WINDOW_MS } from './og'
import { GPC_PRIVACY_PARAGRAPH, rateLimitPrivacyParagraphs, windowPhrase } from './privacy-copy'
import {
  CHECKOUT_RATE_WINDOW_MS,
  GO_RATE_WINDOW_MS,
  NEWSLETTER_RATE_WINDOW_MS,
  PORTAL_RATE_WINDOW_MS,
  RESULT_RATE_WINDOW_MS,
  RESULT_WINDOW_PURGE_INTERVAL_MS,
} from './rate-windows'

describe('privacy policy facts', () => {
  it('names the rate-limit windows the code uses and does not claim a 24-hour delete', () => {
    expect(NEWSLETTER_RATE_WINDOW_MS).toBe(60 * 60_000)
    expect(GO_RATE_WINDOW_MS).toBe(60_000)
    expect(OG_RATE_WINDOW_MS).toBe(60_000)
    expect(RESULT_RATE_WINDOW_MS).toBe(60_000)
    expect(CHECKOUT_RATE_WINDOW_MS).toBe(60 * 60_000)
    expect(PORTAL_RATE_WINDOW_MS).toBe(60 * 60_000)
    expect(RESULT_WINDOW_PURGE_INTERVAL_MS).toBe(60_000)
    expect(windowPhrase(NEWSLETTER_RATE_WINDOW_MS)).toBe('one hour')
    expect(windowPhrase(GO_RATE_WINDOW_MS)).toBe('one minute')

    const paragraphs = rateLimitPrivacyParagraphs()
    const text = paragraphs.join('\n')
    expect(text).toContain('HMAC-SHA256')
    expect(text).toContain('SHA-256')
    expect(text).toContain('one hour')
    expect(text).toContain('one minute')
    expect(text).toContain('word unknown')
    expect(text).toContain('do not delete those rows when the window ends')
    expect(text).toContain('stays in the database')
    expect(text).toContain('If cleanup does not run, the expired row remains')
    expect(text).not.toMatch(/24 hour/i)
    expect(text).not.toContain('raw IP')

    const limiter = readFileSync(path.join(process.cwd(), 'src/lib/rate-limit.ts'), 'utf8')
    expect(limiter).not.toContain('DELETE FROM rate_limits')
    expect(limiter).toContain('DELETE FROM result_rate_windows WHERE expires_at <= ?')
    const keys = readFileSync(path.join(process.cwd(), 'src/lib/ip.ts'), 'utf8')
    expect(keys).toContain('bestbotfor-rate|${action}|${ip ?? \'unknown\'}')
    expect(keys).toContain("createHmac('sha256'")
    const page = readFileSync(path.join(process.cwd(), 'src/app/privacy/page.tsx'), 'utf8')
    expect(page).toContain('rateLimitPrivacyParagraphs()')
    expect(page).toContain('GPC_PRIVACY_PARAGRAPH')
  })

  it('describes Global Privacy Control as an analytics opt-out', () => {
    expect(GPC_PRIVACY_PARAGRAPH).toContain('Sec-GPC')
    expect(GPC_PRIVACY_PARAGRAPH).toContain('navigator.globalPrivacyControl')
    expect(GPC_PRIVACY_PARAGRAPH).toContain('opt-out of analytics')
    expect(GPC_PRIVACY_PARAGRAPH).toContain('do not load Google Analytics')
    expect(GPC_PRIVACY_PARAGRAPH).toContain('store the bbf_consent cookie as denied')
    expect(GPC_PRIVACY_PARAGRAPH).toContain('does not override the signal')
    expect(GPC_PRIVACY_PARAGRAPH).toContain('do not load Vercel Analytics')
    expect(GPC_PRIVACY_PARAGRAPH).toContain('do not send Vercel Analytics events')
  })
})

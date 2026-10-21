import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EMAIL_LOGO_HEIGHT,
  EMAIL_LOGO_URL,
  EMAIL_LOGO_WIDTH,
  EMAIL_SIGNATURE_HTML,
  EMAIL_SIGNATURE_TEXT,
} from './email-signature'

describe('email signature', () => {
  it('plain text has name, title, phone and site', () => {
    expect(EMAIL_SIGNATURE_TEXT).toBe(
      '--\nMark Putiyon\nOwner & Editor-in-Chief, BestBotFor\n(571) 279-8182\nhttps://bestbotfor.com',
    )
  })

  it('html is email-safe: tables, inline styles, no external css or scripts', () => {
    expect(EMAIL_SIGNATURE_HTML).toContain('<table role="presentation"')
    expect(EMAIL_SIGNATURE_HTML).not.toMatch(/<style|<link|<script|class=/i)
    expect(EMAIL_SIGNATURE_HTML).toContain('Owner &amp; Editor-in-Chief, BestBotFor')
    expect(EMAIL_SIGNATURE_HTML).toContain('href="tel:+15712798182"')
    expect(EMAIL_SIGNATURE_HTML).toContain('(571) 279-8182')
  })

  it('logo is https on bestbotfor.com with alt text and explicit size', () => {
    expect(EMAIL_LOGO_URL).toBe('https://bestbotfor.com/email/bestbotfor-logo.png')
    expect(EMAIL_SIGNATURE_HTML).toContain(`src="${EMAIL_LOGO_URL}"`)
    expect(EMAIL_SIGNATURE_HTML).toContain('alt="BestBotFor"')
    expect(EMAIL_SIGNATURE_HTML).toContain(`width="${EMAIL_LOGO_WIDTH}" height="${EMAIL_LOGO_HEIGHT}"`)
  })

  it('logo file exists in /public, is a small 2x PNG', () => {
    const p = join(process.cwd(), 'public/email/bestbotfor-logo.png')
    expect(existsSync(p)).toBe(true)
    const buf = readFileSync(p)
    expect(buf.subarray(1, 4).toString()).toBe('PNG')
    expect(buf.readUInt32BE(16)).toBe(EMAIL_LOGO_WIDTH * 2)
    expect(buf.readUInt32BE(20)).toBe(EMAIL_LOGO_HEIGHT * 2)
    expect(buf.length).toBeLessThan(20_000)
  })
})

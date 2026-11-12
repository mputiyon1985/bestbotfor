import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BRAND } from '@/lib/brand'
import { formatVisibleToolCount, VISIBLE_TOOL_COUNT_WORD } from '@/lib/visible-tool-count'
import { HeroStat } from './hero-stat'

function spoken(count: number): string {
  const text = formatVisibleToolCount(count)
  if (!text) throw new Error(`unusable count ${count}`)
  const html = renderToStaticMarkup(createElement(HeroStat, { count: text }))
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function channel(value: number): number {
  const ratio = value / 255
  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4
}

function contrast(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const parsed = Number.parseInt(hex.slice(1), 16)
    return 0.2126 * channel((parsed >> 16) & 255) + 0.7152 * channel((parsed >> 8) & 255) + 0.0722 * channel(parsed & 255)
  }
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

describe('HeroStat', () => {
  it('follows the count it is given and says that count once', () => {
    expect(spoken(1260)).toBe(`1,260 AI tools ${VISIBLE_TOOL_COUNT_WORD}. 1 right pick for you.`)
    expect(spoken(2)).toBe(`2 AI tools ${VISIBLE_TOOL_COUNT_WORD}. 1 right pick for you.`)
    expect(spoken(1)).toBe(`1 AI tool ${VISIBLE_TOOL_COUNT_WORD}. 1 right pick for you.`)
    expect(spoken(363)).toBe(`363 AI tools ${VISIBLE_TOOL_COUNT_WORD}. 1 right pick for you.`)
    expect(formatVisibleToolCount(0)).toBeNull()
    expect(spoken(1260).match(/1,260/g)).toHaveLength(1)
    expect(spoken(2)).not.toContain('1,260')
    expect(spoken(363)).not.toContain('AI tools listed')

    const html = renderToStaticMarkup(createElement(HeroStat, { count: formatVisibleToolCount(1260)! }))
    expect(html).toContain('data-hero-count')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('hero-stat-rule')
    expect(html).toContain('lg:block')
    expect(html).toContain('font-headline')
    expect(html).toContain('tabular-nums')
    expect(html).toContain('text-accent')
    expect(html).toContain('text-hero-pick')
    expect(html).toContain('text-[6rem]')
    expect(html).toContain('text-2xl')
    expect(html).toContain('whitespace-nowrap')
    expect(html).not.toContain('<img')
  })

  it('keeps the indigo figure and the green digit above the contrast bar', () => {
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
    const light = css.slice(css.indexOf(':root'), css.indexOf('@media'))
    const pick = light.match(/--hero-pick:\s*(#[0-9A-Fa-f]{6})/)?.[1]
    expect(pick).toBe('#0b9b6c')
    // 24px bold and up is large text. The digit stays at least text-2xl.
    expect(contrast(pick ?? '#000000', BRAND.white)).toBeGreaterThanOrEqual(3)
    expect(contrast(BRAND.indigo, BRAND.white)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(BRAND.mint, BRAND.ink)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(BRAND.ink, BRAND.white)).toBeGreaterThanOrEqual(4.5)
    expect(css).toContain('--hero-pick: var(--mint)')
  })
})

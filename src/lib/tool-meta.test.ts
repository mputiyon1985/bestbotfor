import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { TOOL_DESCRIPTION_MAX, TOOL_TITLE_MAX, toolMetaDescription, toolMetaTitle, truncateAtWord } from './tool-meta'

describe('tool page meta', () => {
  it('fits every catalog tool inside the limits', () => {
    for (const tool of toolSeeds) {
      expect(toolMetaTitle(tool as never).length, tool.slug).toBeLessThanOrEqual(TOOL_TITLE_MAX)
      expect(toolMetaDescription(tool as never).length, tool.slug).toBeLessThanOrEqual(TOOL_DESCRIPTION_MAX)
      expect(toolMetaTitle(tool as never), tool.slug).toContain(tool.name)
    }
  })

  it('cuts a long description on a word boundary', () => {
    expect(truncateAtWord('hello world', 20)).toBe('hello world')
    expect(truncateAtWord('hello world', 11)).toBe('hello world')
    expect(truncateAtWord('hello world', 8)).toBe('hello…')
    expect(truncateAtWord('hello world', 7)).toBe('hello…')

    const shortDesc = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ')
    const tool = {
      name: 'Example',
      vendor: 'Vendor',
      shortDesc,
      pricingModel: 'paid',
      priceFromUsd: 10,
      hasFreeTier: false,
    }
    const description = toolMetaDescription(tool)
    const lead = `Example by Vendor: ${shortDesc}.`
    expect(description.endsWith('…')).toBe(true)
    expect(description.length).toBeLessThanOrEqual(TOOL_DESCRIPTION_MAX)
    const before = description.slice(0, -1)
    expect(lead.startsWith(before)).toBe(true)
    expect(lead[before.length]).toMatch(/\s/)
  })

  it('cuts every catalog snippet on a word boundary', () => {
    for (const tool of toolSeeds) {
      const description = toolMetaDescription(tool as never)
      const at = description.indexOf('…')
      if (at === -1) continue
      const lead = `${tool.name} by ${tool.vendor}: ${tool.shortDesc.trim().replace(/\.?$/, '.')}`
      const before = description.slice(0, at)
      expect(lead.startsWith(before), tool.slug).toBe(true)
      const next = lead[before.length]
      expect(next === undefined || /\s/.test(next), `${tool.slug}: ${description}`).toBe(true)
    }
  })

  it('never claims a free plan for paid-only tools', () => {
    for (const slug of ['claude-code', 'midjourney', 'jasper', 'surfer']) {
      const tool = toolSeeds.find((item) => item.slug === slug)!
      expect(tool.hasFreeTier, slug).toBe(false)
      expect(toolMetaTitle(tool as never), slug).not.toMatch(/free/i)
      expect(toolMetaDescription(tool as never), slug).not.toMatch(/free tier/i)
    }
  })
})

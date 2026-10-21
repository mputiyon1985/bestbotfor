import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { TOOL_DESCRIPTION_MAX, TOOL_TITLE_MAX, toolMetaDescription, toolMetaTitle } from './tool-meta'

describe('tool page meta', () => {
  it('fits every catalog tool inside the limits', () => {
    for (const tool of toolSeeds) {
      expect(toolMetaTitle(tool as never).length, tool.slug).toBeLessThanOrEqual(TOOL_TITLE_MAX)
      expect(toolMetaDescription(tool as never).length, tool.slug).toBeLessThanOrEqual(TOOL_DESCRIPTION_MAX)
      expect(toolMetaTitle(tool as never), tool.slug).toContain(tool.name)
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

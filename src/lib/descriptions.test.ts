import { describe, expect, it } from 'vitest'
import { comparePairSeeds, taskSeeds, toolSeeds } from '@/data/catalog'
import { bestGuideDescription, compareDescription } from './descriptions'
import { homeDescription } from './metadata'

describe('meta descriptions', () => {
  it('keeps the home description within 155 characters', () => {
    expect(homeDescription.length).toBeLessThanOrEqual(155)
    expect(homeDescription.startsWith('The right AI in 30 seconds.')).toBe(true)
  })

  it('keeps seeded best and compare descriptions within 160 characters', () => {
    for (const task of taskSeeds) {
      const description = bestGuideDescription(task.name)
      expect(description.length, task.slug).toBeLessThanOrEqual(160)
      expect(description.length, task.slug).toBeLessThanOrEqual(155)
    }
    const names = new Map(toolSeeds.map((tool) => [tool.slug, tool.name]))
    for (const [left, right] of comparePairSeeds) {
      const leftName = names.get(left)
      const rightName = names.get(right)
      expect(leftName, left).toBeTruthy()
      expect(rightName, right).toBeTruthy()
      if (!leftName || !rightName) continue
      const description = compareDescription(leftName, rightName)
      expect(description.length, `${left}-vs-${right}`).toBeLessThanOrEqual(160)
      expect(description).not.toContain('third option')
    }
  })
})

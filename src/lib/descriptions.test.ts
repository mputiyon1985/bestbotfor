import { describe, expect, it } from 'vitest'
import { comparePairSeeds, taskSeeds, toolSeeds } from '@/data/catalog'
import {
  BEST_GUIDE_FIT_LEGEND,
  BEST_GUIDE_TOOL_COUNT,
  bestGuideCrumb,
  bestGuideDescription,
  bestGuideFitAnswer,
  bestGuideHeading,
  bestGuideLead,
  bestGuideListName,
  bestGuideQuestion,
  bestGuideTitle,
  compareDescription,
  taskGerund,
} from './descriptions'
import { homeDescription } from './metadata'

describe('meta descriptions', () => {
  it('keeps the home description within 155 characters', () => {
    expect(homeDescription.length).toBeLessThanOrEqual(155)
    expect(homeDescription.startsWith('The right AI in 30 seconds.')).toBe(true)
  })

  it('names each best guide as a natural phrase', () => {
    expect(bestGuideTitle('Make music')).toBe('Best AI for making music')
    expect(bestGuideHeading('Make music')).toBe('Best AI tool for making music')
    expect(bestGuideTitle('Chat and brainstorm')).toBe('Best AI for chatting and brainstorming')
    expect(bestGuideTitle('Improve SEO')).toBe('Best AI for improving SEO')
    for (const task of taskSeeds) {
      const title = bestGuideTitle(task.name)
      expect(title, task.slug).toMatch(/^Best AI for \S+ing\b/)
      expect(title, task.slug).not.toContain('tool for')
      expect(title.toLowerCase(), task.slug).not.toContain(task.name.toLowerCase())
    }
  })

  it('uses the gerund on every best-of surface for all 17 tasks', () => {
    expect(taskSeeds).toHaveLength(17)
    const infinitive = /\bfor (add|automate|brainstorm|build|chat|create|design|generate|improve|make|research|take|write)\b/i
    for (const task of taskSeeds) {
      const phrase = taskGerund(task.name)
      const copies = [
        bestGuideTitle(task.name),
        bestGuideHeading(task.name),
        bestGuideLead(task.name, 'Sample'),
        bestGuideCrumb(task.name),
        bestGuideQuestion(task.name),
        bestGuideFitAnswer(task.name, 'Sample'),
        bestGuideListName(task.name),
        bestGuideDescription(task.name),
        `Tools ranked for ${phrase}`,
      ]
      for (const copy of copies) {
        expect(copy, `${task.slug}: ${copy}`).not.toMatch(infinitive)
        expect(copy.toLowerCase(), task.slug).toContain(phrase.toLowerCase())
      }
    }
  })

  it('explains fit and lists more than the first five tools', () => {
    expect(BEST_GUIDE_FIT_LEGEND).toMatch(/^Match = how well it fits this job\. Overall rating is separate/)
    expect(BEST_GUIDE_TOOL_COUNT).toBeGreaterThan(5)
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

describe('match vs overall rating labels', () => {
  it('names the two numbers differently and explains why they can differ', async () => {
    const { MATCH_FOR_ANSWERS_LABEL, OVERALL_RATING_NOTE } = await import('./descriptions')
    expect(MATCH_FOR_ANSWERS_LABEL).toBe('Match for your answers')
    expect(OVERALL_RATING_NOTE).toMatch(/^Overall rating: rank and stars across the whole category\./)
    expect(OVERALL_RATING_NOTE).toContain('for one job')
  })
  it('the result page and profile use them', async () => {
    const { readFileSync } = await import('node:fs')
    const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
    expect(read('src/app/result/page.tsx').match(/\{MATCH_FOR_ANSWERS_LABEL\}/g)?.length).toBe(2)
    expect(read('src/app/result/page.tsx')).not.toMatch(/>Fit</)
    expect(read('src/components/editorial.tsx')).toContain('{OVERALL_RATING_NOTE}')
  })
})

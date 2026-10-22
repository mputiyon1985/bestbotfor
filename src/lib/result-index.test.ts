import { describe, expect, it } from 'vitest'
import { taskSeeds } from '@/data/catalog'
import {
  matchesCanonicalPath,
  matchesPageTitle,
  matchesRobots,
  quizResultRobots,
  quizResultTitle,
} from './result-index'

describe('result indexing', () => {
  it('noindexes every quiz combination and every budget filter, and follows their links', () => {
    expect(quizResultRobots()).toEqual({ index: false, follow: true })
    const budgets = ['free', 'low', 'any'] as const
    const skills = ['beginner', 'intermediate', 'pro'] as const
    expect(taskSeeds.length * budgets.length * skills.length).toBe(153)
  })

  it('noindexes every match list and canonicalizes it to the task guide', () => {
    expect(matchesRobots()).toEqual({ index: false, follow: true })
    for (const task of taskSeeds) {
      expect(matchesCanonicalPath(task.slug, 'any', 1, true)).toBe(`/best/${task.slug}`)
      expect(matchesCanonicalPath(task.slug, 'low', 2, true)).toBe(`/best/${task.slug}`)
    }
    // A task with no /best guide keeps its own canonical rather than pointing at a 404.
    expect(matchesCanonicalPath('chat', 'any', 1, false)).toBe('/result?task=chat&view=all')
  })
})

describe('result titles', () => {
  it('uses the task name instead of a lowercased verb phrase', () => {
    expect(matchesPageTitle('Chat and brainstorm', 'any', 1)).toBe('Chat and brainstorm matches')
    expect(matchesPageTitle('Write code', 'any', 2)).toBe('Write code matches, page 2')
    expect(matchesPageTitle('Make music', 'free', 1)).toBe('Make music matches, free only')
    expect(matchesPageTitle('Make music', 'low', 3)).toBe('Make music matches, low cost, page 3')
    expect(quizResultTitle('Chat and brainstorm', 'ChatGPT')).toBe('Chat and brainstorm: ChatGPT')
    expect(quizResultTitle('Write code', 'Cursor')).not.toMatch(/^Best AI tool for write code/)
  })
})

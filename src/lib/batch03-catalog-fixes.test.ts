import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { toolSeeds } from '@/data/catalog'
import { catalogFromSeeds } from '@/test/catalog-from-seeds'
import { matchBudgets } from './matches'
import { recommend } from './recommend'

const seed = (slug: string) => toolSeeds.find((tool) => tool.slug === slug)!
const catalog = catalogFromSeeds()
const skills = ['beginner', 'intermediate', 'pro'] as const

// Ratings backlog batch 03: priceFromUsd is the monthly-billed price.
describe('batch 03 catalog fixes (seed is what prod re-seeds from)', () => {
  it('prices D-ID, Fliki, LanguageTool and Mem at their monthly-billed plans', () => {
    expect(seed('d-id').priceFromUsd).toBe(5.9)
    expect(seed('d-id').longDesc).toContain('Lite is $5.90 a month billed monthly')
    expect(seed('fliki').priceFromUsd).toBe(28)
    expect(seed('languagetool').priceFromUsd).toBe(24.9)
    expect(seed('mem').priceFromUsd).toBe(9)
    expect(seed('mem').category).toBe('Productivity')
  })

  it('keeps Hailuo held: Unrated, no rank, no tie group', () => {
    const csv = readFileSync(path.join(process.cwd(), 'src/data/scores-v2.3.csv'), 'utf8')
    const row = csv.split('\n').find((line) => line.startsWith('hailuo,'))
    expect(row).toBeTruthy()
    expect(row?.startsWith('hailuo,,,,,,')).toBe(true)
    expect(catalog.tools.find((tool) => tool.slug === 'hailuo')?.editorial).toBeNull()
  })

  it('makes D-ID the Video editors #1 and Kling the Video generators #1 (approved by James)', () => {
    const rank = (slug: string) => catalog.tools.find((tool) => tool.slug === slug)?.editorial?.categoryRankDisplay
    expect(rank('d-id')).toBe('#1 of 10 in Video (editors & avatars)')
    expect(rank('captions')).toBe('#2 of 10 in Video (editors & avatars)')
    expect(rank('kling')).toBe('#1 of 4 in Video (generators)')
    expect(rank('runway')).toBe('#2 of 4 in Video (generators)')
    expect(rank('grammarly')).toBe('#1 of 12 in Writing')
  })
})

describe('batch 03 quiz fits (Forge)', () => {
  it('places Kling #3 and D-ID #4 for video/any/beginner and never makes a batch-03 tool the top pick', () => {
    const video = recommend(catalog, { task: 'video', budget: 'any', skill: 'beginner' })!
    const slugs = video.picks.map((pick) => pick.slug)
    expect(slugs[0]).toBe('synthesia')
    expect(slugs.indexOf('kling')).toBe(2)
    expect(slugs.indexOf('d-id')).toBe(3)
    const batch = ['kling', 'd-id', 'quillbot', 'fliki', 'languagetool', 'writer', 'mem']
    for (const task of catalog.tasks) {
      for (const budget of matchBudgets) {
        for (const skill of skills) {
          const top = recommend(catalog, { task: task.slug, budget, skill })?.picks[0]?.slug
          expect(batch, `${task.slug}/${budget}/${skill}`).not.toContain(top)
        }
      }
    }
  })

  it('gives QuillBot a writing fit, but it never makes the writing top picks (ties at 72, loses the name tie-break)', () => {
    expect(seed('quillbot').fits.map((fit) => [fit.task, fit.score])).toEqual([['writing', 72]])
    for (const budget of matchBudgets) {
      for (const skill of skills) {
        const picks = recommend(catalog, { task: 'writing', budget, skill })?.picks ?? []
        expect(picks.map((pick) => pick.slug), `${budget}/${skill}`).not.toContain('quillbot')
      }
    }
  })
})

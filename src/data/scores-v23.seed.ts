import { readFileSync } from 'node:fs'
import path from 'node:path'
import { toolSeeds } from '@/data/catalog'
import { editorialSeeds as v1EditorialSeeds, parseCsv } from '@/data/scores-pros-cons.seed'
import type { RatingSeed } from '@/lib/editorial'

/**
 * Approved ratings v2.3. Evidence, source URL, and third-party columns are
 * present in the file and are dropped here. They are not stored on the score
 * row and not rendered. Pros and cons text stays on the v1 seed for every
 * tool that has it, including tools this file leaves unrated.
 */
const csvPath = path.join(process.cwd(), 'src/data/scores-v2.3.csv')

const REQUIRED = [
  'slug',
  'features',
  'value',
  'ease',
  'quality',
  'overall',
  'rationale',
  'reviewed_at',
  'primary_category',
  'category_rank_display',
  'tie_group',
  'note',
  'status',
  'quiz_eligible',
  'evidence_ref',
  'source_urls',
  'third_party_sources',
] as const

export const ratingSeeds: RatingSeed[] = ratingRowsFromCsv(readFileSync(csvPath, 'utf8'))

const rated = new Set(ratingSeeds.map((row) => row.slug))

/** v1 pros and cons for tools v2.3 still rates. Unrated tools keep their own v1 rows too. */
export const keptProsConsSeeds = v1EditorialSeeds.filter((row) => rated.has(row.slug))

/** Catalog tools with no v2.3 score. The score and rank stay hidden; pros and cons stay. */
export const unratedSlugs = toolSeeds
  .map((tool) => tool.slug)
  .filter((slug) => !rated.has(slug))
  .sort()

export function ratingRowsFromCsv(text: string): RatingSeed[] {
  const table = parseCsv(text)
  const header = table[0]
  if (!header) throw new Error('Ratings CSV is empty')
  const index = new Map(header.map((name, position) => [name, position]))
  for (const column of REQUIRED) {
    if (!index.has(column)) throw new Error(`Ratings CSV is missing ${column}`)
  }

  const rows: RatingSeed[] = []
  for (const record of table.slice(1)) {
    const value = (column: string) => {
      const position = index.get(column)
      return (position === undefined ? '' : (record[position] ?? '')).trim()
    }
    const slug = value('slug')
    if (!slug) throw new Error('Ratings CSV has a row with no slug')
    if (!value('overall')) continue
    const quiz = value('quiz_eligible')
    if (quiz !== 'true' && quiz !== 'false') throw new Error(`${slug} quiz_eligible must be true or false`)
    rows.push({
      slug,
      features: point(slug, 'features', value('features')),
      value: point(slug, 'value', value('value')),
      ease: point(slug, 'ease', value('ease')),
      quality: point(slug, 'quality', value('quality')),
      overall: point(slug, 'overall', value('overall')),
      rationale: value('rationale'),
      reviewedAt: value('reviewed_at'),
      primaryCategory: value('primary_category'),
      categoryRankDisplay: value('category_rank_display'),
      tieGroup: value('tie_group'),
      note: value('note'),
      ratingStatus: value('status'),
      quizEligible: quiz === 'true',
    })
  }
  if (rows.length === 0) throw new Error('Ratings CSV has no rated rows')
  return rows
}

function point(slug: string, key: string, raw: string): number {
  if (!/^\d(?:\.\d)?$/.test(raw)) throw new Error(`${slug} ${key} must be a tenth from 0 to 5`)
  return Number(raw)
}

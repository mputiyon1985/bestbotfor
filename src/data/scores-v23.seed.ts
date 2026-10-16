import { readFileSync } from 'node:fs'
import path from 'node:path'
import { toolSeeds } from '@/data/catalog'
import { editorialSeeds as v1EditorialSeeds, parseCsv } from '@/data/scores-pros-cons.seed'
import type { EditorialSeedPoint, RatingSeed } from '@/lib/editorial'

/**
 * Approved ratings v2.3. Evidence, source URL, and third-party columns are
 * present in the file and are dropped from the score row. They are not stored
 * on that row and not rendered. Tools that already have v1 pros and cons keep
 * those rows. Tools with no v1 points pick up pros and cons from this file
 * when the columns are filled. Empty columns stay empty.
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

const ratingCsv = readFileSync(csvPath, 'utf8')

const POINT_COLUMNS = ['pro1', 'pro1_source', 'pro2', 'pro2_source', 'pro3', 'pro3_source', 'con1', 'con1_source', 'con2', 'con2_source', 'con3', 'con3_source'] as const

export const ratingSeeds: RatingSeed[] = ratingRowsFromCsv(ratingCsv)

const rated = new Set(ratingSeeds.map((row) => row.slug))

/** v1 pros and cons for tools v2.3 still rates. Unrated tools keep their own v1 rows too. */
export const keptProsConsSeeds = v1EditorialSeeds.filter((row) => rated.has(row.slug))

/**
 * Pros and cons from v2.3 for tools the v1 file does not already cover.
 * Cursor and Windsurf are in this list. Grok and Semantic Scholar are not:
 * their pro and con columns are blank.
 */
export const supplementalProsConsSeeds: { slug: string; pros: EditorialSeedPoint[]; cons: EditorialSeedPoint[] }[] =
  prosConsRowsFromRatingCsv(ratingCsv).filter((row) => !v1EditorialSeeds.some((existing) => existing.slug === row.slug))

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

/** Rows that actually have pros or cons. A blank set is omitted, not stored as empty strings. */
export function prosConsRowsFromRatingCsv(text: string): { slug: string; pros: EditorialSeedPoint[]; cons: EditorialSeedPoint[] }[] {
  const table = parseCsv(text)
  const header = table[0]
  if (!header) throw new Error('Ratings CSV is empty')
  const index = new Map(header.map((name, position) => [name, position]))
  for (const column of POINT_COLUMNS) {
    if (!index.has(column)) throw new Error(`Ratings CSV is missing ${column}`)
  }
  const rows: { slug: string; pros: EditorialSeedPoint[]; cons: EditorialSeedPoint[] }[] = []
  for (const record of table.slice(1)) {
    const value = (column: string) => {
      const position = index.get(column)
      return (position === undefined ? '' : (record[position] ?? '')).trim()
    }
    const slug = value('slug')
    if (!slug) throw new Error('Ratings CSV has a row with no slug')
    const pros = pointPair(value, slug, 'pro')
    const cons = pointPair(value, slug, 'con')
    if (pros.length === 0 && cons.length === 0) continue
    rows.push({ slug, pros, cons })
  }
  return rows
}

function pointPair(value: (column: string) => string, slug: string, kind: 'pro' | 'con'): EditorialSeedPoint[] {
  const points: EditorialSeedPoint[] = []
  for (const position of [1, 2, 3]) {
    const text = value(`${kind}${position}`)
    const sourceUrl = value(`${kind}${position}_source`)
    if (!text && !sourceUrl) continue
    if (!text || !sourceUrl) throw new Error(`${slug} ${kind}${position} needs both text and a source URL`)
    points.push({ text, sourceUrl })
  }
  return points
}

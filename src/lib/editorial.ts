/**
 * Our rating is an editorial rubric, not a user review.
 *
 * Each part is 0–5. The overall score is a weighted average:
 * quality 40%, features 25%, value 20%, ease 15%. Those weights sum to 100.
 * Parts are read in tenths, multiplied by the weight, divided by 100, and
 * rounded to one decimal with half-up rounding. Example: quality 4, features 4,
 * value 4, and ease 5 become 4.2. The numbers are not rescaled.
 *
 * Quality is the output for the tool’s main task. It is not a user review.
 * Evidence and source URL columns are never part of this type and are not rendered.
 */
export const SCORE_WEIGHTS = {
  quality: 40,
  features: 25,
  value: 20,
  ease: 15,
} as const

export const UNMAINTAINED_NOTICE = 'Unmaintained (repo archived)'

/** Categories with a single rated tool. Their rank line is not shown. */
export const SINGLE_TOOL_CATEGORIES = ['backend', 'design', 'games', 'productivity'] as const

export type Rubric = {
  features: number
  value: number
  ease: number
  quality: number
}

/** Page data for a score. Internal source URLs stay in the database and are not part of this type. */
export type EditorialScore = Rubric & {
  overall: number
  rationale: string
  reviewedAt: string
  primaryCategory: string
  categoryRankDisplay: string
  tieGroup: string
  tied: boolean
  hideRank: boolean
  note: string
  ratingStatus: string
  quizEligible: boolean
}

export type RatingSeed = Rubric & {
  slug: string
  overall: number
  rationale: string
  reviewedAt: string
  primaryCategory: string
  categoryRankDisplay: string
  tieGroup: string
  note: string
  ratingStatus: string
  quizEligible: boolean
}

export type ProCon = {
  kind: 'pro' | 'con'
  text: string
  sourceUrl: string
}

export type EditorialSeedPoint = {
  text: string
  sourceUrl: string
}

export type EditorialSeed = Rubric & {
  slug: string
  overall: number
  rationale: string
  reviewedAt: string
  pros: EditorialSeedPoint[]
  cons: EditorialSeedPoint[]
}

export function overallScore(parts: Rubric): number {
  const tenths = (value: number) => Math.round(value * 10)
  const weighted =
    tenths(parts.quality) * SCORE_WEIGHTS.quality +
    tenths(parts.features) * SCORE_WEIGHTS.features +
    tenths(parts.value) * SCORE_WEIGHTS.value +
    tenths(parts.ease) * SCORE_WEIGHTS.ease
  return Math.round(weighted / 100) / 10
}

export function categoryToolCounts(rows: ReadonlyArray<{ primaryCategory: string }>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.primaryCategory, (counts.get(row.primaryCategory) ?? 0) + 1)
  }
  return counts
}

export function tieGroupCounts(rows: ReadonlyArray<{ tieGroup: string }>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.tieGroup) continue
    counts.set(row.tieGroup, (counts.get(row.tieGroup) ?? 0) + 1)
  }
  return counts
}

export function hidesCategoryRank(primaryCategory: string, counts: ReadonlyMap<string, number>): boolean {
  return (counts.get(primaryCategory) ?? 0) <= 1
}

export function sharesTieGroup(tieGroup: string, counts: ReadonlyMap<string, number>): boolean {
  return tieGroup.length > 0 && (counts.get(tieGroup) ?? 0) > 1
}

/** Five fill amounts from 0 to 1. 4.3 is four full stars and one star at 0.3. */
export function starFills(score: number): number[] {
  const tenths = Math.min(50, Math.max(0, Math.round(score * 10)))
  return [0, 1, 2, 3, 4].map((index) => {
    const starTenths = tenths - index * 10
    if (starTenths >= 10) return 1
    if (starTenths <= 0) return 0
    return starTenths / 10
  })
}

export function ratingAriaLabel(score: number): string {
  const tenths = Math.min(50, Math.max(0, Math.round(score * 10)))
  const text = tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1)
  return `Rated ${text} out of 5`
}

function isRubricPoint(value: number): boolean {
  if (!Number.isFinite(value) || value < 0 || value > 5) return false
  return Math.abs(value * 10 - Math.round(value * 10)) < 1e-6
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.includes('.')
  } catch {
    return false
  }
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * Reject a seed that would invent a score, skip a source, or write the wrong
 * number of pros and cons. Throws before the database transaction starts.
 */
export function validateEditorialSeeds(
  rows: EditorialSeed[],
  knownSlugs: ReadonlySet<string>,
  blockedSlugs: ReadonlySet<string> = new Set(),
): void {
  const seen = new Set<string>()
  for (const row of rows) {
    if (!knownSlugs.has(row.slug)) throw new Error(`Editorial seed names an unknown tool: ${row.slug}`)
    if (blockedSlugs.has(row.slug)) throw new Error(`${row.slug} needs verification and cannot have a score`)
    if (seen.has(row.slug)) throw new Error(`Editorial seed repeats ${row.slug}`)
    seen.add(row.slug)
    for (const key of ['features', 'value', 'ease', 'quality', 'overall'] as const) {
      if (!isRubricPoint(row[key])) throw new Error(`${row.slug} ${key} must be from 0 to 5 in tenths`)
    }
    const expected = overallScore(row)
    if (Math.abs(expected - row.overall) > 0.001) {
      throw new Error(`${row.slug} overall is ${row.overall}; the weighted average is ${expected}`)
    }
    if (row.rationale.trim().length < 30) throw new Error(`${row.slug} rationale is too short to be a real review note`)
    if (!isIsoDate(row.reviewedAt)) throw new Error(`${row.slug} reviewedAt must be YYYY-MM-DD`)
    assertPoints(row.slug, 'pros', row.pros, 3, 3)
    assertPoints(row.slug, 'cons', row.cons, 2, 3)
  }
}

const RANK_DISPLAY = /^#\d+ of \d+ in .+$/

/**
 * v2.3 score rows only. Pros and cons are checked separately so v1 point text
 * can stay without being re-scored. Evidence and source URL columns are rejected
 * if they show up on a public field.
 */
export function validateRatingSeeds(rows: RatingSeed[], knownSlugs: ReadonlySet<string>): void {
  const seen = new Set<string>()
  for (const row of rows) {
    if (!knownSlugs.has(row.slug)) throw new Error(`Rating seed names an unknown tool: ${row.slug}`)
    if (seen.has(row.slug)) throw new Error(`Rating seed repeats ${row.slug}`)
    seen.add(row.slug)
    for (const key of ['features', 'value', 'ease', 'quality', 'overall'] as const) {
      if (!isRubricPoint(row[key])) throw new Error(`${row.slug} ${key} must be from 0 to 5 in tenths`)
    }
    const expected = overallScore(row)
    if (Math.abs(expected - row.overall) > 0.001) {
      throw new Error(`${row.slug} overall is ${row.overall}; the weighted average is ${expected}`)
    }
    const rationale = row.rationale.trim()
    if (rationale.length > 0 && rationale.length < 30) {
      throw new Error(`${row.slug} rationale is too short to be a real review note`)
    }
    if (!isIsoDate(row.reviewedAt)) throw new Error(`${row.slug} reviewedAt must be YYYY-MM-DD`)
    if (!row.primaryCategory.trim()) throw new Error(`${row.slug} is missing a primary category`)
    if (!RANK_DISPLAY.test(row.categoryRankDisplay)) {
      throw new Error(`${row.slug} category rank must look like #3 of 12 in Coding`)
    }
    if (row.tieGroup && !/^[A-Za-z0-9-]+$/.test(row.tieGroup)) throw new Error(`${row.slug} tie group is not a plain label`)
    if (row.ratingStatus !== 'Active' && row.ratingStatus !== UNMAINTAINED_NOTICE) {
      throw new Error(`${row.slug} status is not a known rating status`)
    }
    assertNoSourceLeak(row.slug, row.rationale)
    assertNoSourceLeak(row.slug, row.note)
    assertNoSourceLeak(row.slug, row.categoryRankDisplay)
    assertNoSourceLeak(row.slug, row.primaryCategory)
    assertNoSourceLeak(row.slug, row.tieGroup)
    assertNoSourceLeak(row.slug, row.ratingStatus)
  }

  const categories = categoryToolCounts(rows)
  const singles = [...categories.entries()]
    .filter(([, count]) => count === 1)
    .map(([category]) => category)
    .sort()
  const expectedSingles = [...SINGLE_TOOL_CATEGORIES].sort()
  if (singles.join() !== expectedSingles.join()) {
    throw new Error(`Single-tool categories are ${singles.join(', ')}; expected ${expectedSingles.join(', ')}`)
  }
  const ties = tieGroupCounts(rows)
  for (const [group, count] of ties) {
    if (count < 2) throw new Error(`Tie group ${group} has ${count} tool`)
  }
}

/** Pros and cons rows. Does not re-check the old equal-weight overall. */
export function validateProsConsSeeds(
  rows: ReadonlyArray<{ slug: string; pros: EditorialSeedPoint[]; cons: EditorialSeedPoint[] }>,
  knownSlugs: ReadonlySet<string>,
): void {
  const seen = new Set<string>()
  for (const row of rows) {
    if (!knownSlugs.has(row.slug)) throw new Error(`Pros and cons name an unknown tool: ${row.slug}`)
    if (seen.has(row.slug)) throw new Error(`Pros and cons repeat ${row.slug}`)
    seen.add(row.slug)
    assertPoints(row.slug, 'pros', row.pros, 3, 3)
    assertPoints(row.slug, 'cons', row.cons, 2, 3)
  }
}

function assertNoSourceLeak(slug: string, value: string): void {
  if (/https?:\/\//i.test(value) || value.includes('pcmag.com') || value.includes('evidence.jsonl') || value.includes('source_urls')) {
    throw new Error(`${slug} public rating field contains a source or evidence reference`)
  }
}

function assertPoints(slug: string, kind: string, points: EditorialSeedPoint[], min: number, max: number): void {
  if (points.length < min || points.length > max) {
    throw new Error(`${slug} needs ${min}–${max} ${kind}, found ${points.length}`)
  }
  for (const point of points) {
    if (point.text.trim().length < 8) throw new Error(`${slug} has an empty ${kind}`)
    if (!isHttpsUrl(point.sourceUrl)) throw new Error(`${slug} ${kind} source must be an https URL`)
  }
}

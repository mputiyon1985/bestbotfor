/**
 * BestBotFor score is an editorial rubric, not a user review.
 *
 * Each part is 0–5. The overall score is an equal-weight average:
 * features, value, ease, and quality each count for 25%. Those weights sum to 100.
 * Parts are read in tenths, multiplied by the weight, divided by 100, and
 * rounded to one decimal with half-up rounding. Example: 4, 4, 5, and 4
 * become 4.3.
 *
 * Quality is the output for the tool’s main task. It is not a user review.
 */
export const SCORE_WEIGHTS = {
  features: 25,
  value: 25,
  ease: 25,
  quality: 25,
} as const

export const HOW_WE_SCORE =
  'BestBotFor score is an editorial rating from 0 to 5, not a user review. We read the vendor’s docs and pricing and score four parts equally: features, value, ease, and quality. Each part is 25% of the score. The stars show that average, rounded to one decimal. Features is how fully the tool covers the job. Value comes from the official pricing page. Ease is how quickly a beginner gets a result. Quality is the output for the tool’s main task. We do not publish this as an aggregate rating.'

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

/** Catalog tools with no editorial row yet. They have no score and no pros or cons. */
export const UNRATED_SLUGS = [
  'perplexity',
  'canva',
  'cursor',
  'windsurf',
  'grok',
  'writer',
  'lex',
  'languagetool',
  'clipdrop',
  'vidnoz',
  'podcastle',
  'flux',
  'semantic-scholar',
] as const

export function overallScore(parts: Rubric): number {
  const tenths = (value: number) => Math.round(value * 10)
  const weighted =
    tenths(parts.features) * SCORE_WEIGHTS.features +
    tenths(parts.value) * SCORE_WEIGHTS.value +
    tenths(parts.ease) * SCORE_WEIGHTS.ease +
    tenths(parts.quality) * SCORE_WEIGHTS.quality
  return Math.round(weighted / 100) / 10
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
      throw new Error(`${row.slug} overall is ${row.overall}; the equal-weight average is ${expected}`)
    }
    if (row.rationale.trim().length < 30) throw new Error(`${row.slug} rationale is too short to be a real review note`)
    if (!isIsoDate(row.reviewedAt)) throw new Error(`${row.slug} reviewedAt must be YYYY-MM-DD`)
    assertPoints(row.slug, 'pros', row.pros, 3, 3)
    assertPoints(row.slug, 'cons', row.cons, 2, 3)
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

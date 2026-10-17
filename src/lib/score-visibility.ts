import { ratingAriaLabel, starFills, type EditorialScore } from './editorial'
import { SHOW_SCORES } from './site'

export const SCORE_HEADING = 'Our rating'
export const HOW_WE_SCORE_HEADING = 'How we score'

const RATING_KEYS = new Set(['aggregateRating', 'ratingValue', 'reviewRating', 'bestRating', 'worstRating'])

export type PublicCriterion = {
  label: 'Quality' | 'Features' | 'Value' | 'Ease'
  value: number
  text: string
}

export type PublicScore = {
  heading: typeof SCORE_HEADING
  overall: number
  ariaLabel: string
  overallText: string
  fills: number[]
  criteria: PublicCriterion[]
  rationale: string
  reviewedAt: string
}

/** Reads SHOW_SCORES unless a caller passes the other state, which tests do. */
export function scoresPublished(flag: boolean = SHOW_SCORES): boolean {
  return flag
}

export function publicScore(
  editorial: EditorialScore | null | undefined,
  showScores: boolean = scoresPublished(),
): PublicScore | null {
  if (!showScores || !editorial) return null
  const criteria = (
    [
      ['Quality', editorial.quality],
      ['Features', editorial.features],
      ['Value', editorial.value],
      ['Ease', editorial.ease],
    ] as const
  ).map(([label, value]): PublicCriterion => {
    const text = formatScore(value)
    return { label, value, text }
  })
  return {
    heading: SCORE_HEADING,
    overall: editorial.overall,
    ariaLabel: ratingAriaLabel(editorial.overall),
    overallText: `${formatScore(editorial.overall)} out of 5`,
    fills: starFills(editorial.overall),
    criteria,
    rationale: editorial.rationale,
    reviewedAt: editorial.reviewedAt,
  }
}

/** Removes editorial score wording. Job-fit ranks and pros and cons are left alone. */
export function omitScoreText(text: string, showScores: boolean = scoresPublished()): string {
  if (showScores) return text
  return text
    .replaceAll(SCORE_HEADING, '')
    .replaceAll(HOW_WE_SCORE_HEADING, '')
    .replace(/Rated \d+(?:\.\d+)? out of 5/gi, '')
    .replace(/\d+(?:\.\d+)? out of 5/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([.!?])\s*[.!?]+/g, '$1')
    .trim()
}

/** Drops AggregateRating fields always. Score phrases in other strings stay while the flag is on. */
export function jsonLdForPage(data: unknown, showScores: boolean = scoresPublished()): unknown {
  return stripScores(data, showScores)
}

function stripScores(value: unknown, showScores: boolean): unknown {
  if (typeof value === 'string') return omitScoreText(value, showScores)
  if (Array.isArray(value)) return value.map((item) => stripScores(item, showScores))
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (RATING_KEYS.has(key)) continue
    out[key] = stripScores(child, showScores)
  }
  return out
}

export function formatScore(value: number): string {
  const tenths = Math.round(value * 10)
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1)
}

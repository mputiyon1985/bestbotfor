export type TrustTier = 'not_eligible' | 'verified' | 'established'

export type TrustInput = {
  emailVerified: boolean
  pastWaitingPeriod: boolean
  accountAgeDays: number
  otherPublishedReviews: number
  upheldModerationIn180Days: boolean
}

export type ScoredReview = {
  stars: number
  weight: number
  status?: string
  countsTowardScore?: number
}

const THRESHOLD = 5

export function trustTier(input: TrustInput): { tier: TrustTier; weight: 1 | 1.5 | null } {
  if (!input.emailVerified || !input.pastWaitingPeriod) return { tier: 'not_eligible', weight: null }
  const established =
    input.accountAgeDays >= 90 && input.otherPublishedReviews >= 2 && !input.upheldModerationIn180Days
  if (established) return { tier: 'established', weight: 1.5 }
  return { tier: 'verified', weight: 1 }
}

function weightHalves(weight: number): number | null {
  if (weight === 1) return 2
  if (weight === 1.5) return 3
  return null
}

function round1(numerator: number, denominator: number): number {
  const scaled = numerator * 10
  const quotient = Math.trunc(scaled / denominator)
  const remainder = scaled % denominator
  const roundUp = remainder * 2 >= denominator
  return (quotient + (roundUp ? 1 : 0)) / 10
}

/** Weighted user score to one decimal. Null when fewer than 5 counting reviews. */
export function userScore(reviews: readonly ScoredReview[]): number | null {
  let numerator = 0
  let denominator = 0
  let count = 0
  for (const review of reviews) {
    if (review.status !== undefined && review.status !== 'published') continue
    if (review.countsTowardScore !== undefined && review.countsTowardScore !== 1) continue
    if (!Number.isInteger(review.stars) || review.stars < 1 || review.stars > 5) continue
    const halves = weightHalves(review.weight)
    if (halves === null) continue
    numerator += review.stars * halves
    denominator += halves
    count += 1
  }
  if (count < THRESHOLD || denominator === 0) return null
  return round1(numerator, denominator)
}

export function meetsScoreThreshold(count: number): boolean {
  return count >= THRESHOLD
}

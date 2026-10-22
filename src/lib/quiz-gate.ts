import { toolSeeds } from '@/data/catalog'

/** #138 (bot scout, Oct 22, 2026) is the first batch held to the rating rule. */
export const QUIZ_RATING_REQUIRED_FROM = '2026-10-22'

/**
 * Tools added on or after QUIZ_RATING_REQUIRED_FROM. Unrated ones never get a
 * quiz match score; every older tool, rated or not, behaves as before.
 */
export const ratingRequiredSlugs: ReadonlySet<string> = new Set(
  toolSeeds.filter((tool) => tool.addedAt != null && tool.addedAt >= QUIZ_RATING_REQUIRED_FROM).map((tool) => tool.slug),
)

export function quizNeedsRating(slug: string): boolean {
  return ratingRequiredSlugs.has(slug)
}

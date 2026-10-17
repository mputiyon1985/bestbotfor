export const REVIEW_ORDERS = ['recent', 'highest', 'lowest'] as const
export type ReviewOrder = (typeof REVIEW_ORDERS)[number]

export type OrderedReview = {
  id: string
  stars: number
  publishedAt: number
}

/** Sort published reviews. The input type has no sponsor or affiliate field. */
export function orderReviews<T extends OrderedReview>(reviews: readonly T[], order: ReviewOrder): T[] {
  const copy = [...reviews]
  copy.sort((left, right) => {
    if (order === 'highest' && left.stars !== right.stars) return right.stars - left.stars
    if (order === 'lowest' && left.stars !== right.stars) return left.stars - right.stars
    if (left.publishedAt !== right.publishedAt) return right.publishedAt - left.publishedAt
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })
  return copy
}

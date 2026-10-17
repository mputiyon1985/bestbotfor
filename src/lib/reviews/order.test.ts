import { describe, expect, it } from 'vitest'
import { orderReviews, type OrderedReview } from './order'

type OrderKey = keyof OrderedReview
type SponsorKey = Extract<OrderKey, 'sponsor' | 'affiliate' | 'sponsored'>
const orderHasNoSponsor: [SponsorKey] extends [never] ? true : never = true

const reviews: OrderedReview[] = [
  { id: 'a', stars: 2, publishedAt: 30 },
  { id: 'b', stars: 5, publishedAt: 10 },
  { id: 'c', stars: 5, publishedAt: 20 },
]

describe('orderReviews', () => {
  it('orders by recent, highest, and lowest without a sponsor input', () => {
    expect(orderReviews(reviews, 'recent').map((review) => review.id)).toEqual(['a', 'c', 'b'])
    expect(orderReviews(reviews, 'highest').map((review) => review.id)).toEqual(['c', 'b', 'a'])
    expect(orderReviews(reviews, 'lowest').map((review) => review.id)).toEqual(['a', 'c', 'b'])
    expect(orderReviews(reviews, 'highest')).toEqual(orderReviews(reviews, 'highest'))
    expect(orderHasNoSponsor).toBe(true)
  })
})

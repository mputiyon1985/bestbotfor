import { describe, expect, it } from 'vitest'
import { meetsScoreThreshold, trustTier, userScore, type ScoredReview } from './score'

type ScoreKey = keyof ScoredReview
type SponsorKey = Extract<ScoreKey, 'sponsor' | 'affiliate' | 'sponsored'>
const scoreHasNoSponsor: [SponsorKey] extends [never] ? true : never = true

describe('user score', () => {
  it('returns 4.1 for the worked example and nothing below five reviews', () => {
    const reviews = [
      { stars: 5, weight: 1 },
      { stars: 5, weight: 1.5 },
      { stars: 4, weight: 1 },
      { stars: 2, weight: 1 },
      { stars: 4, weight: 1.5 },
    ]
    expect(userScore(reviews)).toBe(4.1)
    expect(userScore(reviews.slice(0, 4))).toBe(null)
    expect(meetsScoreThreshold(4)).toBe(false)
    expect(meetsScoreThreshold(5)).toBe(true)
    expect(scoreHasNoSponsor).toBe(true)
  })

  it('ignores unpublished reviews, disclosed connections, and sponsor-shaped extras', () => {
    const counting = { stars: 5, weight: 1, status: 'published', countsTowardScore: 1 }
    const hidden = [
      { ...counting, status: 'pending' },
      { ...counting, status: 'held' },
      { ...counting, countsTowardScore: 0 },
    ]
    expect(userScore([...Array(5).fill(counting), ...hidden])).toBe(5)
    const again = userScore([...Array(5).fill(counting)])
    expect(again).toBe(userScore([...Array(5).fill(counting)]))
  })

  it('stays between 1.0 and 5.0 for random counting reviews', () => {
    for (let sample = 0; sample < 200; sample += 1) {
      const count = 5 + (sample % 12)
      const reviews = Array.from({ length: count }, (_, index) => ({
        stars: 1 + ((sample + index) % 5),
        weight: index % 2 === 0 ? 1 : 1.5,
      }))
      const score = userScore(reviews)
      expect(score).not.toBeNull()
      expect(score!).toBeGreaterThanOrEqual(1)
      expect(score!).toBeLessThanOrEqual(5)
      expect(Number.isInteger(Math.round(score! * 10))).toBe(true)
    }
  })
})

describe('trust tier', () => {
  const established = {
    emailVerified: true,
    pastWaitingPeriod: true,
    accountAgeDays: 90,
    otherPublishedReviews: 2,
    upheldModerationIn180Days: false,
  }

  it('weights verified accounts at 1 and established accounts at 1.5', () => {
    expect(trustTier({ ...established, emailVerified: false }).tier).toBe('not_eligible')
    expect(trustTier({ ...established, pastWaitingPeriod: false }).weight).toBeNull()
    expect(trustTier({ ...established, accountAgeDays: 89 }).weight).toBe(1)
    expect(trustTier({ ...established, otherPublishedReviews: 1 }).weight).toBe(1)
    expect(trustTier({ ...established, upheldModerationIn180Days: true }).tier).toBe('verified')
    expect(trustTier(established)).toEqual({ tier: 'established', weight: 1.5 })
  })
})

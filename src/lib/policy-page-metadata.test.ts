import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/flags', () => ({
  userRatingsEnabled: () => true,
}))

import { generateMetadata as guidelinesMetadata } from '@/app/review-guidelines/page'
import { generateMetadata as howRatingsMetadata } from '@/app/how-user-ratings-work/page'
import { pageMetadata } from './metadata'
import { POLICY_PAGES_LAWYER_APPROVED } from './review-flags'

const originalVercel = process.env.VERCEL_ENV
const originalRatings = process.env.USER_RATINGS

afterEach(() => {
  if (originalVercel === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = originalVercel
  if (originalRatings === undefined) delete process.env.USER_RATINGS
  else process.env.USER_RATINGS = originalRatings
})

describe('policy page robots', () => {
  it('hard-sets noindex, nofollow in production when the ratings flag is on', async () => {
    expect(POLICY_PAGES_LAWYER_APPROVED).toBe(false)
    process.env.VERCEL_ENV = 'production'
    process.env.USER_RATINGS = 'on'
    const open = pageMetadata({
      title: 'Review guidelines',
      description: 'Draft rules for user ratings on BestBotFor. Pending lawyer review.',
      path: '/review-guidelines',
    })
    expect(open.robots).toEqual({ index: true, follow: true })

    for (const generate of [guidelinesMetadata, howRatingsMetadata]) {
      const meta = await generate()
      expect(meta.robots).toEqual({ index: false, follow: false })
    }
  })
})

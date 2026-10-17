import { describe, expect, it } from 'vitest'
import UnmatchedPage from '@/app/[...slug]/page'

describe('unmatched 404 route', () => {
  it('calls notFound so Next inserts the only noindex meta', () => {
    expect(() => UnmatchedPage()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/)
  })
})

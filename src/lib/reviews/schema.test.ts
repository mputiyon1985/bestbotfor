import { describe, expect, it } from 'vitest'
import { reviewFormSchema } from './schema'

const valid = {
  stars: 4,
  pros: 'Fast',
  cons: '',
  useCaseText: 'Writing',
  role: 'Developer',
  usageDuration: '1 to 6 months',
  planType: 'Paid plan',
  connection: 'none' as const,
  connectionText: '',
  attestation: true as const,
}

describe('reviewFormSchema', () => {
  it('accepts a complete form and blank optional fields', () => {
    expect(reviewFormSchema.safeParse(valid).success).toBe(true)
    expect(reviewFormSchema.safeParse({ ...valid, role: '', usageDuration: '', planType: '', pros: '' }).success).toBe(true)
  })

  it('rejects stars outside 1 to 5, long text, a missing attestation, and a bad connection', () => {
    expect(reviewFormSchema.safeParse({ ...valid, stars: 0 }).success).toBe(false)
    expect(reviewFormSchema.safeParse({ ...valid, stars: 6 }).success).toBe(false)
    expect(reviewFormSchema.safeParse({ ...valid, stars: 1.5 }).success).toBe(false)
    expect(reviewFormSchema.safeParse({ ...valid, pros: 'a'.repeat(1001) }).success).toBe(false)
    expect(reviewFormSchema.safeParse({ ...valid, cons: 'a'.repeat(1001) }).success).toBe(false)
    expect(reviewFormSchema.safeParse({ ...valid, useCaseText: 'a'.repeat(281) }).success).toBe(false)
    expect(reviewFormSchema.safeParse({ ...valid, role: 'Wizard' }).success).toBe(false)
    expect(reviewFormSchema.safeParse({ ...valid, attestation: false }).success).toBe(false)
    expect(reviewFormSchema.safeParse({ ...valid, connection: 'disclosed', connectionText: '' }).success).toBe(false)
    expect(reviewFormSchema.safeParse({ ...valid, connection: 'none', connectionText: 'credits' }).success).toBe(false)
    expect(
      reviewFormSchema.safeParse({ ...valid, connection: 'disclosed', connectionText: 'I received free credits' }).success,
    ).toBe(true)
  })
})

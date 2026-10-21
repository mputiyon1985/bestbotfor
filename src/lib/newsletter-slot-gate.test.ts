import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { newsletterSlotAvailable, newsletterSlotOpen } from './newsletter-slot-gate'

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

describe('newsletter slot gate', () => {
  it('opens only with at least one synced subscriber', () => {
    expect(newsletterSlotOpen(0)).toBe(false)
    expect(newsletterSlotOpen(1)).toBe(true)
    expect(newsletterSlotOpen(Number.NaN)).toBe(false)
  })
  it('fails closed on a read error', async () => {
    expect(await newsletterSlotAvailable(async () => { throw new Error('db down') })).toBe(false)
    expect(await newsletterSlotAvailable(async () => 3)).toBe(true)
  })
  it('the checkout action refuses the newsletter slot while it is hidden', () => {
    const action = read('src/app/sponsor/actions.ts')
    expect(action).toContain("parsed.value.offering === 'newsletter_slot' && !(await newsletterSlotAvailable())")
  })
})

describe('sponsor page copy', () => {
  const page = read('src/app/sponsor/page.tsx')
  it('drops internal wording', () => {
    expect(page).not.toContain('server configuration')
    expect(page).not.toContain('configured on the server')
    expect(read('src/lib/sponsor-form-copy.ts')).not.toContain('not configured yet')
  })
  it('pitches the founding offer as a discounted founding test', () => {
    expect(page).toContain('The founding offer is a discounted founding test')
  })
})

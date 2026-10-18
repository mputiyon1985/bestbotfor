import { describe, expect, it } from 'vitest'
import { SIGN_UP_WINDOW_MS, signUpTrackDecision } from './sign-up-analytics'

const now = 1_000_000

function decide(overrides: Partial<Parameters<typeof signUpTrackDecision>[0]> = {}) {
  return signUpTrackDecision({
    consent: 'granted',
    gtagReady: true,
    signedIn: true,
    userId: 'user_1',
    createdAtMs: now - 60_000,
    now,
    trackedUserId: null,
    ...overrides,
  })
}

describe('signUpTrackDecision', () => {
  it('tracks a new account only after consent and gtag are ready', () => {
    expect(decide()).toBe('track')
    expect(decide({ consent: null })).toBe('wait')
    expect(decide({ consent: 'denied' })).toBe('wait')
    expect(decide({ gtagReady: false })).toBe('wait')
  })

  it('skips signed-out visitors, old accounts, and an account already sent', () => {
    expect(decide({ signedIn: false })).toBe('skip')
    expect(decide({ userId: null })).toBe('skip')
    expect(decide({ createdAtMs: null })).toBe('skip')
    expect(decide({ createdAtMs: now - SIGN_UP_WINDOW_MS - 1 })).toBe('skip')
    expect(decide({ trackedUserId: 'user_1' })).toBe('skip')
    expect(decide({ createdAtMs: now + 10 * 60 * 1000 })).toBe('skip')
  })
})

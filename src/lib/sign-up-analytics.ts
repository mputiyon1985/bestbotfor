/** A new Clerk account can emit sign_up during this window, and only once. */
export const SIGN_UP_WINDOW_MS = 30 * 60 * 1000

const FUTURE_SKEW_MS = 5 * 60 * 1000

export type SignUpTrackDecision = 'track' | 'wait' | 'skip'

/**
 * `wait` means the account is new but analytics consent or gtag is not ready.
 * `skip` means this is not a new account, or this browser already sent the event.
 */
export function signUpTrackDecision(input: {
  consent: 'granted' | 'denied' | null
  gtagReady: boolean
  signedIn: boolean
  userId: string | null
  createdAtMs: number | null
  now: number
  trackedUserId: string | null
}): SignUpTrackDecision {
  if (!input.signedIn || !input.userId || input.createdAtMs === null) return 'skip'
  if (input.trackedUserId === input.userId) return 'skip'
  if (input.createdAtMs - input.now > FUTURE_SKEW_MS) return 'skip'
  if (input.now - input.createdAtMs > SIGN_UP_WINDOW_MS) return 'skip'
  if (input.consent !== 'granted' || !input.gtagReady) return 'wait'
  return 'track'
}

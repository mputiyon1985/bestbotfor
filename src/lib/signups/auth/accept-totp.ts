import { claimTotpStep } from './store'
import { matchingTotpSteps } from './totp'

/**
 * Accept a code once. A later login with the same time step is refused, including
 * on another serverless instance, because the step is stored in the site database.
 * A database error refuses the code.
 */
export async function acceptTotp(code: string, secretBase32: string, now = Date.now()): Promise<boolean> {
  const matched = matchingTotpSteps(code, secretBase32, now)
  if (!matched || matched.length === 0) return false
  try {
    for (const step of matched) {
      if (await claimTotpStep(step, now)) return true
    }
  } catch {
    return false
  }
  return false
}

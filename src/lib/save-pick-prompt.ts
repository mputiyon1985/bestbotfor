/**
 * Only a quiz result may be the post-signup return path.
 * Anything else, including an absolute URL, stays off the redirect.
 */
const RESULT_RETURN =
  /^\/result\?task=[a-z0-9]+(?:-[a-z0-9]+)*&budget=(?:free|low|any)&skill=(?:beginner|intermediate|pro)$/

export function resultReturnPath(value: string): string | null {
  if (value.length > 200) return null
  if (!RESULT_RETURN.test(value)) return null
  return value
}

export function savePickSignUpHref(sharePath: string): string {
  const next = resultReturnPath(sharePath)
  if (!next) return '/sign-up'
  return `/sign-up?redirect_url=${encodeURIComponent(next)}`
}

/** Clerk forceRedirectUrl. Invalid values fall back to the members page. */
export function signUpRedirect(value: string): string {
  return resultReturnPath(value) ?? '/members'
}

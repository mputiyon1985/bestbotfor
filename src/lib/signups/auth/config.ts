import { MIN_SESSION_SECRET_LENGTH } from './session'

const BASE32 = /^[A-Z2-7]+=*$/i

/** Session secret. Not trimmed: whitespace is part of a wrong value, not a match. */
export function signupsSessionSecret(): string {
  return process.env.SIGNUPS_SESSION_SECRET ?? ''
}

export function signupsPasswordHash(): string {
  return process.env.SIGNUPS_ADMIN_PASSWORD_HASH ?? ''
}

export function signupsTotpSecret(): string {
  return process.env.SIGNUPS_TOTP_SECRET ?? ''
}

/**
 * Fail closed. Login and the dashboard stay dark until all three secrets are
 * present and shaped like the values `npm run setup-signups-auth` writes.
 */
export function signupsAuthConfigured(
  env: {
    session?: string
    hash?: string
    totp?: string
  } = {
    session: signupsSessionSecret(),
    hash: signupsPasswordHash(),
    totp: signupsTotpSecret(),
  },
): boolean {
  const session = env.session ?? ''
  const hash = env.hash ?? ''
  const totp = (env.totp ?? '').replace(/\s/g, '')
  if (session.length < MIN_SESSION_SECRET_LENGTH) return false
  if (!hash.startsWith('scrypt:16384:8:1:')) return false
  if (totp.length < 16 || !BASE32.test(totp)) return false
  return true
}

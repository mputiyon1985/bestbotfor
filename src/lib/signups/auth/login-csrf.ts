import { SIGNUPS_LOGIN } from '../paths'

export const LOGIN_CSRF_COOKIE = 'signups_login_csrf'
export const LOGIN_CSRF_HEADER = 'x-login-csrf'
export const LOGIN_CSRF_MAX_AGE_SECONDS = 60 * 30

export const loginCsrfCookie = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: SIGNUPS_LOGIN,
  maxAge: LOGIN_CSRF_MAX_AGE_SECONDS,
}

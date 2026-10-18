import { describe, expect, it } from 'vitest'
import { resultReturnPath, savePickSignUpHref, signUpRedirect } from './save-pick-prompt'

const result = '/result?task=chat&budget=any&skill=beginner'

describe('save pick sign-up redirect', () => {
  it('builds a sign-up link that returns to the quiz result', () => {
    expect(savePickSignUpHref(result)).toBe(`/sign-up?redirect_url=${encodeURIComponent(result)}`)
    expect(signUpRedirect(result)).toBe(result)
    expect(resultReturnPath(result)).toBe(result)
  })

  it('refuses an open redirect and any path that is not a quiz result', () => {
    for (const value of [
      'https://evil.example/result',
      '//evil.example',
      '/result?task=chat&budget=any&skill=beginner&email=reader@example.com',
      '/admin',
      '/members',
      '/result?view=all',
      '',
    ]) {
      expect(resultReturnPath(value), value).toBeNull()
      expect(signUpRedirect(value), value).toBe('/members')
    }
    expect(savePickSignUpHref('/admin')).toBe('/sign-up')
  })
})

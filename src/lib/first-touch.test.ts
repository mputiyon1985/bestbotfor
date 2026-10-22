import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  beehiivUtmFields,
  captureFirstTouch,
  FIRST_TOUCH_JSON_MAX,
  FIRST_TOUCH_STORAGE_KEY,
  FIRST_TOUCH_TTL_MS,
  firstTouchFromUrl,
  firstTouchOptedOut,
  isFirstTouchExpired,
  LANDING_PATH_MAX,
  parseFirstTouch,
  readFirstTouch,
  sanitizeLandingPath,
  sanitizeUtmValue,
  UTM_VALUE_MAX,
} from './first-touch'
import { signUpUnsafeMetadata } from '@/components/sign-up-panel'
import { FIRST_TOUCH_PRIVACY_PARAGRAPH, NEWSLETTER_SIGNUP_PARAGRAPH } from './privacy-copy'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  const writes: string[] = []
  return {
    data,
    writes,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(key)
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
}

const now = new Date('2026-10-19T16:00:00.000Z')

describe('first-touch UTM capture', () => {
  it('sanitizes and caps tag values', () => {
    expect(sanitizeUtmValue('facebook')).toBe('facebook')
    expect(sanitizeUtmValue('  w1_oct19  ')).toBe('w1_oct19')
    expect(sanitizeUtmValue('<script>alert(1)</script>')).toBe('scriptalert1script')
    expect(sanitizeUtmValue('a"b\'c;d\ne')).toBe('abcde')
    expect(sanitizeUtmValue('x'.repeat(500))).toHaveLength(UTM_VALUE_MAX)
    expect(sanitizeUtmValue('')).toBeNull()
    expect(sanitizeUtmValue('<<>>')).toBeNull()
    expect(sanitizeUtmValue(42)).toBeNull()
  })

  it('keeps only a same-site path with no query or hash', () => {
    expect(sanitizeLandingPath('/best/music')).toBe('/best/music')
    expect(sanitizeLandingPath('/best/music?utm_source=x#top')).toBe('/best/music')
    expect(sanitizeLandingPath('//evil.example/x')).toBe('/')
    expect(sanitizeLandingPath('https://evil.example/')).toBe('/')
    expect(sanitizeLandingPath('/a<b>')).toBe('/ab')
    expect(sanitizeLandingPath(`/${'p'.repeat(400)}`)).toHaveLength(LANDING_PATH_MAX)
    expect(sanitizeLandingPath(undefined)).toBe('/')
  })

  it('reads the four tags and the landing path, and ignores URLs without tags', () => {
    expect(
      firstTouchFromUrl('?utm_source=facebook&utm_medium=social&utm_campaign=w1_oct19&utm_content=fb1&utm_term=x&q=secret', '/best/music', now),
    ).toEqual({
      utm_source: 'facebook',
      utm_medium: 'social',
      utm_campaign: 'w1_oct19',
      utm_content: 'fb1',
      landing_path: '/best/music',
      at: now.toISOString(),
    })
    expect(firstTouchFromUrl('?q=hello', '/', now)).toBeNull()
    expect(firstTouchFromUrl('', '/', now)).toBeNull()
    expect(firstTouchFromUrl('?utm_source=%3C%3E', '/', now)).toBeNull()
  })

  it('writes only when nothing is stored yet', () => {
    const storage = memoryStorage()
    expect(captureFirstTouch({ search: '', pathname: '/' }, storage, now)).toBeNull()
    expect(storage.writes).toEqual([])
    captureFirstTouch({ search: '?utm_source=x&utm_campaign=one', pathname: '/compare/a-vs-b' }, storage, now)
    captureFirstTouch({ search: '?utm_source=facebook&utm_campaign=two', pathname: '/' }, storage, now)
    expect(storage.writes).toEqual([FIRST_TOUCH_STORAGE_KEY])
    expect(readFirstTouch(storage)).toMatchObject({ utm_source: 'x', utm_campaign: 'one', landing_path: '/compare/a-vs-b' })
  })

  it('replaces a corrupt stored entry and survives a throwing storage', () => {
    const storage = memoryStorage({ [FIRST_TOUCH_STORAGE_KEY]: '{not json' })
    expect(captureFirstTouch({ search: '?utm_source=x', pathname: '/' }, storage, now)).toMatchObject({ utm_source: 'x' })
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(captureFirstTouch({ search: '?utm_source=x', pathname: '/' }, throwing, now)).toBeNull()
    expect(readFirstTouch(throwing)).toBeNull()
  })

  it('re-sanitizes a posted record and rejects oversized or tagless input', () => {
    expect(
      parseFirstTouch(JSON.stringify({ utm_source: 'face<>book', landing_path: '//x', extra: 'drop', at: now.toISOString() }), now),
    ).toEqual({
      utm_source: 'facebook',
      landing_path: '/',
      at: now.toISOString(),
    })
    // A record with no valid arrival time cannot age out, so it is rejected.
    expect(parseFirstTouch(JSON.stringify({ utm_source: 'x', landing_path: '/', at: 'nope' }), now)).toBeNull()
    expect(parseFirstTouch(JSON.stringify({ utm_source: 'x', landing_path: '/' }), now)).toBeNull()
    expect(parseFirstTouch(JSON.stringify({ landing_path: '/' }))).toBeNull()
    expect(parseFirstTouch('x'.repeat(FIRST_TOUCH_JSON_MAX + 1))).toBeNull()
    expect(parseFirstTouch('[]')).toBeNull()
    expect(parseFirstTouch(null)).toBeNull()
  })

  it('maps to Beehiiv fields with the fixed pair only as the fallback', () => {
    expect(beehiivUtmFields(null)).toEqual({ utm_source: 'bestbotfor', utm_medium: 'website' })
    expect(beehiivUtmFields({ utm_campaign: 'w1', landing_path: '/' })).toEqual({ utm_campaign: 'w1' })
    expect(beehiivUtmFields({ landing_path: '/' })).toEqual({ utm_source: 'bestbotfor', utm_medium: 'website' })
  })

  it('puts the record in Clerk unsafeMetadata only when one exists', () => {
    expect(signUpUnsafeMetadata(null)).toBeUndefined()
    const record = { utm_source: 'x', landing_path: '/' }
    expect(signUpUnsafeMetadata(record)).toEqual({ first_touch: record })
    const panel = readFileSync(path.join(process.cwd(), 'src/components/sign-up-panel.tsx'), 'utf8')
    expect(panel).toContain('unsafeMetadata={signUpUnsafeMetadata(firstTouch)}')
  })

  it('expires 90 days after arrival and removes the expired copy', () => {
    const day = 24 * 60 * 60 * 1000
    const at = (ms: number) => new Date(now.getTime() - ms).toISOString()
    expect(FIRST_TOUCH_TTL_MS).toBe(90 * day)
    expect(isFirstTouchExpired({ at: at(89 * day) }, now)).toBe(false)
    expect(isFirstTouchExpired({ at: at(90 * day) }, now)).toBe(false)
    expect(isFirstTouchExpired({ at: at(90 * day + 1) }, now)).toBe(true)
    expect(isFirstTouchExpired({ at: at(-2 * day) }, now)).toBe(true)
    expect(isFirstTouchExpired({}, now)).toBe(true)
    const old = JSON.stringify({ utm_source: 'old', landing_path: '/', at: at(91 * day) })
    expect(parseFirstTouch(old, now)).toBeNull()
    const storage = memoryStorage({ [FIRST_TOUCH_STORAGE_KEY]: old })
    expect(readFirstTouch(storage, now, { optedOut: false })).toBeNull()
    expect(storage.data.has(FIRST_TOUCH_STORAGE_KEY)).toBe(false)
    const again = memoryStorage({ [FIRST_TOUCH_STORAGE_KEY]: old })
    expect(captureFirstTouch({ search: '?utm_source=fresh', pathname: '/' }, again, now, { optedOut: false })).toMatchObject({
      utm_source: 'fresh',
      at: now.toISOString(),
    })
  })

  it('captures and sends nothing while GPC is on or analytics is denied', () => {
    const storage = memoryStorage()
    expect(captureFirstTouch({ search: '?utm_source=x', pathname: '/' }, storage, now, { optedOut: true })).toBeNull()
    expect(storage.writes).toEqual([])
    const stored = memoryStorage()
    captureFirstTouch({ search: '?utm_source=x', pathname: '/' }, stored, now, { optedOut: false })
    expect(readFirstTouch(stored, now, { optedOut: true })).toBeNull()
    expect(readFirstTouch(stored, now, { optedOut: false })).toMatchObject({ utm_source: 'x' })

    const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    const doc = Object.getOwnPropertyDescriptor(globalThis, 'document')
    const setGlobals = (gpc: boolean, cookie: string) => {
      Object.defineProperty(globalThis, 'navigator', { value: { globalPrivacyControl: gpc }, configurable: true })
      Object.defineProperty(globalThis, 'document', { value: { cookie }, configurable: true })
    }
    try {
      setGlobals(true, '')
      expect(firstTouchOptedOut()).toBe(true)
      expect(captureFirstTouch({ search: '?utm_source=x', pathname: '/' }, memoryStorage(), now)).toBeNull()
      setGlobals(false, 'bbf_consent=denied')
      expect(firstTouchOptedOut()).toBe(true)
      setGlobals(false, 'bbf_consent=granted')
      expect(firstTouchOptedOut()).toBe(false)
      setGlobals(false, '')
      expect(firstTouchOptedOut()).toBe(false)
      expect(captureFirstTouch({ search: '?utm_source=x', pathname: '/' }, memoryStorage(), now)).toMatchObject({ utm_source: 'x' })
    } finally {
      if (nav) Object.defineProperty(globalThis, 'navigator', nav)
      else Reflect.deleteProperty(globalThis, 'navigator')
      if (doc) Object.defineProperty(globalThis, 'document', doc)
      else Reflect.deleteProperty(globalThis, 'document')
    }
  })

  it('is mounted sitewide and the components go through the opt-out-aware helpers', () => {
    const capture = readFileSync(path.join(process.cwd(), 'src/components/first-touch-capture.tsx'), 'utf8')
    expect(capture).toContain('captureFirstTouch(window.location)')
    const layout = readFileSync(path.join(process.cwd(), 'src/app/layout.tsx'), 'utf8')
    expect(layout).toContain('<FirstTouchCapture />')
    const form = readFileSync(path.join(process.cwd(), 'src/components/newsletter-form.tsx'), 'utf8')
    expect(form).toContain('<FirstTouchField />')
  })

  it('is disclosed on the privacy page', () => {
    expect(FIRST_TOUCH_PRIVACY_PARAGRAPH).toContain('We record which link brought you to the site')
    expect(FIRST_TOUCH_PRIVACY_PARAGRAPH).toContain(FIRST_TOUCH_STORAGE_KEY)
    expect(NEWSLETTER_SIGNUP_PARAGRAPH).toContain('If we did not record one, we send utm_source set to bestbotfor and utm_medium set to website.')
    const page = readFileSync(path.join(process.cwd(), 'src/app/privacy/page.tsx'), 'utf8')
    expect(page).toContain('FIRST_TOUCH_PRIVACY_PARAGRAPH')
  })

  it('privacy line splits Beehiiv tags from Clerk landing path and arrival time', () => {
    // Beehiiv gets only the four utm values; landing path and "at" go to Clerk at sign-up.
    expect(FIRST_TOUCH_PRIVACY_PARAGRAPH).toContain(
      'On a newsletter signup we send only the utm_source, utm_medium, utm_campaign, and utm_content values to Beehiiv.',
    )
    expect(FIRST_TOUCH_PRIVACY_PARAGRAPH).toContain(
      'On an account sign-up we send those tags, the landing page, and the arrival time to Clerk.',
    )
    expect(FIRST_TOUCH_PRIVACY_PARAGRAPH).not.toMatch(/send them only with a newsletter signup \(to Beehiiv\)/)
    // Beehiiv sentence must not claim the landing page or arrival time.
    const beehiivSentence = FIRST_TOUCH_PRIVACY_PARAGRAPH.match(/On a newsletter signup[^.]+\./)?.[0] ?? ''
    expect(beehiivSentence).toContain('Beehiiv')
    expect(beehiivSentence).not.toMatch(/landing page|arrival time|when you arrived/i)
    const clerkSentence = FIRST_TOUCH_PRIVACY_PARAGRAPH.match(/On an account sign-up[^.]+\./)?.[0] ?? ''
    expect(clerkSentence).toContain('Clerk')
    expect(clerkSentence).toMatch(/landing page/)
    expect(clerkSentence).toMatch(/arrival time/)
  })
})

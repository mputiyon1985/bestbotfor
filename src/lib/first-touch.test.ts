import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  beehiivUtmFields,
  captureFirstTouch,
  FIRST_TOUCH_JSON_MAX,
  FIRST_TOUCH_STORAGE_KEY,
  firstTouchFromUrl,
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
    expect(parseFirstTouch(JSON.stringify({ utm_source: 'face<>book', landing_path: '//x', extra: 'drop', at: 'nope' }))).toEqual({
      utm_source: 'facebook',
      landing_path: '/',
    })
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

  it('does not depend on analytics consent and is mounted sitewide', () => {
    const capture = readFileSync(path.join(process.cwd(), 'src/components/first-touch-capture.tsx'), 'utf8')
    expect(capture).not.toMatch(/consent|gpc/i)
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

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NEWSLETTER_CTA_COPY } from '@/data/newsletter-cta-copy'
import { newsletterCtaEnabled } from './flags'
import { track } from './analytics'
import {
  NEWSLETTER_CTA_DISMISS_KEY,
  NEWSLETTER_CTA_DISMISS_MS,
  dismissNewsletterCta,
  isNewsletterCtaDismissed,
  newsletterCtaThanks,
  parseNewsletterCtaPath,
  scrolledPastThreshold,
} from './newsletter-cta'
import { NEWSLETTER_CTA_PRODUCTION_LAUNCH } from './review-flags'
import { NEWSLETTER_SIGNUP_PARAGRAPH, newsletterSignupParagraph } from './privacy-copy'
import { absoluteUrl } from './site'
import { subscribeToNewsletter } from './newsletter'
import { PENDING_SUCCESS, RACE_SUCCESS, SYNCED_SUCCESS } from './newsletter-status'
import { createTestDatabase } from '@/test/db'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    map,
  }
}

describe('newsletterCtaEnabled', () => {
  it('is launched in production but still needs NEWSLETTER_CTA=on, and fails closed', () => {
    expect(NEWSLETTER_CTA_PRODUCTION_LAUNCH).toBe(true)
    expect(newsletterCtaEnabled({ newsletterCta: 'on', vercelEnv: 'production' })).toBe(true)
    expect(newsletterCtaEnabled({ newsletterCta: undefined, vercelEnv: 'production' })).toBe(false)
    expect(newsletterCtaEnabled({ newsletterCta: '', vercelEnv: 'production' })).toBe(false)
    expect(newsletterCtaEnabled({ newsletterCta: 'on', vercelEnv: 'production' }, false)).toBe(false)
    expect(newsletterCtaEnabled({ newsletterCta: 'on', vercelEnv: undefined })).toBe(false)
    expect(newsletterCtaEnabled({ newsletterCta: 'true', vercelEnv: 'preview' })).toBe(false)
    expect(newsletterCtaEnabled({ newsletterCta: '', vercelEnv: 'test' })).toBe(false)
    expect(newsletterCtaEnabled({ newsletterCta: 'on', vercelEnv: 'test' })).toBe(true)
    expect(newsletterCtaEnabled({ newsletterCta: 'on', vercelEnv: 'preview' })).toBe(true)
    expect(newsletterCtaEnabled({ newsletterCta: 'on', vercelEnv: 'production' }, true)).toBe(true)
  })
})

describe('parseNewsletterCtaPath', () => {
  it('accepts only in-scope page paths', () => {
    for (const ok of ['/compare/chatgpt-vs-claude', '/alternatives/jasper', '/best/music', '/best/coding/free', '/guides/how-to-choose-an-ai-tool']) {
      expect(parseNewsletterCtaPath(ok)).toBe(ok)
    }
    for (const bad of ['/', '/pricing', '/best', '/compare/', '//evil.example/x', '/best/music?email=a@b.c', '/guides/X', 'https://evil.example/best/x', '/best/a/b', 42, null]) {
      expect(parseNewsletterCtaPath(bad)).toBeNull()
    }
  })
})

describe('dismissal storage', () => {
  it('persists for 7 days, then expires and is removed', () => {
    const storage = memoryStorage()
    const now = 1_800_000_000_000
    expect(isNewsletterCtaDismissed(storage, now)).toBe(false)
    dismissNewsletterCta(storage, now)
    expect(storage.map.get(NEWSLETTER_CTA_DISMISS_KEY)).toBe(String(now))
    expect(isNewsletterCtaDismissed(storage, now + NEWSLETTER_CTA_DISMISS_MS - 1)).toBe(true)
    expect(isNewsletterCtaDismissed(storage, now + NEWSLETTER_CTA_DISMISS_MS)).toBe(false)
    expect(storage.map.has(NEWSLETTER_CTA_DISMISS_KEY)).toBe(false)
  })

  it('treats corrupt or future values as not dismissed', () => {
    const storage = memoryStorage()
    storage.setItem(NEWSLETTER_CTA_DISMISS_KEY, 'garbage')
    expect(isNewsletterCtaDismissed(storage, 1_000)).toBe(false)
    storage.setItem(NEWSLETTER_CTA_DISMISS_KEY, String(10_000_000))
    expect(isNewsletterCtaDismissed(storage, 1_000)).toBe(false)
  })
})

describe('scrolledPastThreshold', () => {
  it('shows the bar at 40% of the scrollable height', () => {
    expect(scrolledPastThreshold(0, 800, 2800)).toBe(false)
    expect(scrolledPastThreshold(799, 800, 2800)).toBe(false)
    expect(scrolledPastThreshold(800, 800, 2800)).toBe(true)
    expect(scrolledPastThreshold(0, 800, 800)).toBe(false)
  })
})

describe('copy', () => {
  it('uses the final option A copy from one constants file', () => {
    expect(NEWSLETTER_CTA_COPY).toMatchObject({
      headline: 'Get the right AI, every Thursday',
      sub: 'The Daily Bot: one short email a week with new picks, price changes and tools worth a look. Free.',
      button: 'Send me The Daily Bot',
      finePrint: 'No spam. Unsubscribe anytime.',
      stickyBar: 'The right AI in 30 seconds, and in your inbox every Thursday.',
      thanks: 'Almost done. Check your inbox.',
    })
  })
})

describe('privacy copy', () => {
  it('is unchanged while the flag is off and names the CTA pages when it is on', () => {
    expect(newsletterSignupParagraph(false)).toBe(NEWSLETTER_SIGNUP_PARAGRAPH)
    expect(NEWSLETTER_SIGNUP_PARAGRAPH).not.toContain('any page under')
    const on = newsletterSignupParagraph(true)
    expect(on).toContain('/alternatives/elevenlabs, or any page under /compare/, /alternatives/, /best/, or /guides/.')
  })
})

describe('track newsletter_signup source', () => {
  const g = globalThis as Record<string, unknown>
  afterEach(() => {
    delete g.window
    delete g.document
  })

  it('sends the page path as source and is a no-op without gtag', () => {
    const gtag = vi.fn()
    g.document = { cookie: 'bbf_consent=granted' }
    g.window = { gtag }
    expect(track('newsletter_signup', { source: '/best/music' })).toBe(true)
    expect(gtag).toHaveBeenCalledWith('event', 'newsletter_signup', { source: '/best/music' })
    expect(track('newsletter_signup', { source: 'a@b.c' })).toBe(true)
    expect(gtag).toHaveBeenLastCalledWith('event', 'newsletter_signup', {})
    expect(track('quiz_start', { source: '/best/music', task: 'music' })).toBe(true)
    expect(gtag).toHaveBeenLastCalledWith('event', 'quiz_start', { task: 'music' })
    expect(track('affiliate_click', { source: 'best', tool: 'jasper' })).toBe(true)
    expect(gtag).toHaveBeenLastCalledWith('event', 'affiliate_click', { tool: 'jasper' })
    g.window = {}
    expect(track('newsletter_signup', { source: '/best/music' })).toBe(false)
  })
})

describe('subscribeToNewsletter referringPath', () => {
  const originalKey = process.env.BEEHIIV_API_KEY
  const originalPublication = process.env.BEEHIIV_PUBLICATION_ID
  afterEach(() => {
    if (originalKey === undefined) delete process.env.BEEHIIV_API_KEY
    else process.env.BEEHIIV_API_KEY = originalKey
    if (originalPublication === undefined) delete process.env.BEEHIIV_PUBLICATION_ID
    else process.env.BEEHIIV_PUBLICATION_ID = originalPublication
  })

  it('sends the CTA page path as referring_site with the utm tags', async () => {
    process.env.BEEHIIV_API_KEY = 'beehiiv-test'
    process.env.BEEHIIV_PUBLICATION_ID = 'pub_abc123'
    const { db, close } = await createTestDatabase()
    const bodies: Record<string, unknown>[] = []
    const result = await subscribeToNewsletter({
      email: 'cta@example.com',
      honeypot: '',
      source: 'compare',
      referringPath: '/compare/chatgpt-vs-claude',
      firstTouch: { utm_source: 'x', utm_medium: 'social', utm_campaign: 'oct', landing_path: '/compare/chatgpt-vs-claude' },
      db,
      rateKey: 'newsletter-cta-path',
      now: 1_000,
      fetchImpl: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body ?? '{}')))
        return new Response(JSON.stringify({ data: { id: 'sub_cta' } }), { status: 201 })
      },
    })
    expect(result).toMatchObject({ status: 'success', tracked: true })
    expect(bodies[0]).toMatchObject({
      referring_site: absoluteUrl('/compare/chatgpt-vs-claude'),
      utm_source: 'x',
      utm_medium: 'social',
      utm_campaign: 'oct',
    })
    await close()
  })
})

describe('newsletterCtaThanks', () => {
  it('shows the check-your-inbox copy only on the confirm-email paths', () => {
    expect(newsletterCtaThanks(SYNCED_SUCCESS)).toBe(NEWSLETTER_CTA_COPY.thanks)
    expect(newsletterCtaThanks(RACE_SUCCESS)).toBe(NEWSLETTER_CTA_COPY.thanks)
  })

  it('shows the server message on the pending path', () => {
    expect(newsletterCtaThanks(PENDING_SUCCESS)).toBe(PENDING_SUCCESS)
    expect(newsletterCtaThanks(PENDING_SUCCESS)).not.toContain('Check your inbox')
  })

  it('pending signup (no Beehiiv key) ends on the server message, not the inbox copy', async () => {
    delete process.env.BEEHIIV_API_KEY
    delete process.env.BEEHIIV_PUBLICATION_ID
    const { db, close } = await createTestDatabase()
    const result = await subscribeToNewsletter({
      email: 'cta-pending@example.com',
      honeypot: '',
      source: 'compare',
      referringPath: '/compare/chatgpt-vs-claude',
      db,
      rateKey: 'newsletter-cta-pending',
      now: 1_000,
    })
    expect(result).toMatchObject({ status: 'success', message: PENDING_SUCCESS })
    expect(newsletterCtaThanks(result.message)).toBe(PENDING_SUCCESS)
    await close()
  })
})

describe('page wiring', () => {
  const pages = [
    'src/app/compare/[pair]/page.tsx',
    'src/app/alternatives/[tool]/page.tsx',
    'src/app/best/[task]/page.tsx',
    'src/app/best/[task]/free/page.tsx',
    'src/app/guides/[slug]/page.tsx',
  ]
  it('every in-scope page renders the CTA only behind newsletterCtaEnabled()', () => {
    for (const file of pages) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8')
      expect(source, file).toContain('const cta = newsletterCtaEnabled()')
      for (const line of source.split('\n').filter((l) => l.includes('<NewsletterCta '))) {
        expect(line, file).toMatch(/cta(Path)? \?/)
      }
    }
  })
})

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { sponsorshipCreatives, sponsorshipDailyCounts, sponsorships } from './db/schema'
import { createTestDatabase } from '@/test/db'
import {
  bestTaskFromGoPage,
  countsAsSponsorTraffic,
  incrementSponsorDaily,
  isBotUserAgent,
  listSponsorPlacementCounts,
  scheduleSponsorGoClick,
  scheduleSponsorImpression,
  utcDay,
  type SponsorTrafficSignal,
} from './sponsor-impressions'

const START = 1_700_000_000_000
const HUMAN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const HUMAN: SponsorTrafficSignal = {
  method: 'GET',
  userAgent: HUMAN_UA,
  purpose: null,
  secPurpose: null,
  routerPrefetch: null,
  middlewarePrefetch: null,
}

describe('sponsor traffic filter', () => {
  it('counts a normal GET and skips bots, prefetch, and HEAD', () => {
    expect(countsAsSponsorTraffic(HUMAN)).toBe(true)
    expect(countsAsSponsorTraffic({ ...HUMAN, method: 'HEAD' })).toBe(false)
    expect(countsAsSponsorTraffic({ ...HUMAN, method: null })).toBe(false)
    expect(countsAsSponsorTraffic({ ...HUMAN, userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })).toBe(false)
    expect(countsAsSponsorTraffic({ ...HUMAN, userAgent: 'Mozilla/5.0 HeadlessChrome/120.0.0.0' })).toBe(false)
    expect(countsAsSponsorTraffic({ ...HUMAN, userAgent: 'curl/8.0.0' })).toBe(false)
    expect(countsAsSponsorTraffic({ ...HUMAN, userAgent: '   ' })).toBe(false)
    expect(countsAsSponsorTraffic({ ...HUMAN, userAgent: null })).toBe(false)
    expect(countsAsSponsorTraffic({ ...HUMAN, purpose: 'prefetch' })).toBe(false)
    expect(countsAsSponsorTraffic({ ...HUMAN, secPurpose: 'prefetch' })).toBe(false)
    expect(countsAsSponsorTraffic({ ...HUMAN, routerPrefetch: '1' })).toBe(false)
    expect(countsAsSponsorTraffic({ ...HUMAN, middlewarePrefetch: '1' })).toBe(false)
    expect(isBotUserAgent(HUMAN_UA)).toBe(false)
    expect(bestTaskFromGoPage('/best/coding')).toBe('coding')
    expect(bestTaskFromGoPage('/best/coding/extra')).toBeNull()
    expect(bestTaskFromGoPage('/tools/chatgpt')).toBeNull()
    expect(utcDay(START)).toBe('2023-11-14')
  })
})

describe('sponsor daily counts', () => {
  it('stores one row per placement per day and no visitor identifier', async () => {
    const { db, close } = await createTestDatabase()
    await incrementSponsorDaily(db, 4, utcDay(START), 'impressions')
    await incrementSponsorDaily(db, 4, utcDay(START), 'impressions')
    await incrementSponsorDaily(db, 4, utcDay(START), 'go_clicks')
    await incrementSponsorDaily(db, 4, utcDay(START + 24 * 60 * 60 * 1000), 'impressions')
    await incrementSponsorDaily(db, 4, 'not-a-day', 'impressions')
    const rows = await db.select().from(sponsorshipDailyCounts)
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.day === '2023-11-14')).toMatchObject({
      sponsorshipId: 4,
      impressions: 2,
      goClicks: 1,
    })
    expect(rows.find((row) => row.day === '2023-11-15')).toMatchObject({ impressions: 1, goClicks: 0 })
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(['day', 'goClicks', 'impressions', 'sponsorshipId'])
    const source = readFileSync(path.join(process.cwd(), 'src/lib/sponsor-impressions.ts'), 'utf8')
    expect(source).not.toContain('ipHash')
    expect(source).not.toContain('cookie')
    expect(source).not.toContain('userId')
    await close()
  })

  it('schedules the write without waiting and ignores a bot', async () => {
    const { db, close } = await createTestDatabase()
    const jobs: Array<() => Promise<void>> = []
    scheduleSponsorImpression(
      { ...HUMAN, db, sponsorshipId: 4, now: START, userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0)' },
      (work) => {
        jobs.push(work)
      },
    )
    expect(jobs).toHaveLength(0)

    const started = Date.now()
    scheduleSponsorImpression({ ...HUMAN, db, sponsorshipId: 4, now: START }, (work) => {
      jobs.push(work)
    })
    expect(Date.now() - started).toBeLessThan(50)
    expect(await db.select().from(sponsorshipDailyCounts)).toHaveLength(0)
    const job = jobs[0]
    if (!job) throw new Error('missing count')
    await job()
    const rows = await db.select().from(sponsorshipDailyCounts)
    expect(rows).toEqual([
      { sponsorshipId: 4, day: '2023-11-14', impressions: 1, goClicks: 0 },
    ])
    await close()
  })

  it('logs a failed or slow write by error name and still returns immediately', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = {
      insert() {
        return {
          values() {
            return {
              onConflictDoUpdate: () => Promise.reject(new Error('sponsor@example.com Example Tools')),
            }
          },
        }
      },
    }
    let failed: Promise<void> | undefined
    scheduleSponsorImpression(
      { ...HUMAN, db: failing as never, sponsorshipId: 4, now: START },
      (work) => {
        failed = work()
      },
    )
    await failed
    expect(errorLog).toHaveBeenCalledWith('sponsor count failed', 'Error')
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('sponsor@example.com')
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(HUMAN_UA)

    const hung = {
      insert() {
        return {
          values() {
            return { onConflictDoUpdate: () => new Promise(() => {}) }
          },
        }
      },
    }
    let slow: Promise<void> | undefined
    const started = Date.now()
    scheduleSponsorImpression(
      { ...HUMAN, db: hung as never, sponsorshipId: 4, now: START },
      (work) => {
        slow = work()
      },
      40,
    )
    expect(Date.now() - started).toBeLessThan(30)
    await slow
    expect(errorLog).toHaveBeenCalledWith('sponsor count failed', 'DeadlineError')
    errorLog.mockRestore()
  })

  it('adds a /go click only for an approved placement on that /best page', async () => {
    const { db, close } = await createTestDatabase()
    const inserted = await db
      .insert(sponsorships)
      .values({
        stripeCheckoutSessionId: 'cs_live',
        offering: 'placement_weekly',
        status: 'paid',
        company: 'Example Tools',
        email: 'sponsor@example.com',
        taskSlug: 'coding',
        createdAt: START,
        updatedAt: START,
        paidAt: START,
      })
      .returning({ id: sponsorships.id })
    const sponsorshipId = inserted[0]?.id
    if (!sponsorshipId) throw new Error('missing sponsorship')
    await db.insert(sponsorshipCreatives).values({
      sponsorshipId,
      toolName: 'Widget',
      description: 'A useful coding tool.',
      url: 'https://example.com/widget',
      logoMime: 'image/png',
      logoBytes: PNG,
      status: 'approved',
      approvedToolName: 'Widget',
      approvedDescription: 'A useful coding tool.',
      approvedUrl: 'https://example.com/widget',
      approvedLogoMime: 'image/png',
      approvedLogoBytes: PNG,
      approvedContentHash: 'a'.repeat(64),
      approvedVersion: 1,
      createdAt: START,
      updatedAt: START,
    })

    const jobs: Array<() => Promise<void>> = []
    scheduleSponsorGoClick(
      { ...HUMAN, db, page: '/tools/chatgpt', now: START },
      (work) => {
        jobs.push(work)
      },
    )
    scheduleSponsorGoClick(
      { ...HUMAN, db, page: '/best/coding', now: START, userAgent: 'Mozilla/5.0 HeadlessChrome/120.0.0.0' },
      (work) => {
        jobs.push(work)
      },
    )
    expect(jobs).toHaveLength(0)

    scheduleSponsorGoClick(
      { ...HUMAN, db, page: '/best/coding', now: START },
      (work) => {
        jobs.push(work)
      },
    )
    expect(jobs).toHaveLength(1)
    await jobs[0]?.()
    const listed = await listSponsorPlacementCounts(db)
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      sponsorshipId,
      company: 'Example Tools',
      taskSlug: 'coding',
      toolName: 'Widget',
      days: [{ day: '2023-11-14', impressions: 0, goClicks: 1 }],
    })
    expect(JSON.stringify(listed)).not.toContain('sponsor@example.com')
    expect(listed[0]).not.toHaveProperty('email')
    await close()
  })

  it('is scheduled from the guide and /go without the page waiting on the write', () => {
    const page = readFileSync(path.join(process.cwd(), 'src/app/best/[task]/page.tsx'), 'utf8')
    const route = readFileSync(path.join(process.cwd(), 'src/app/go/[slug]/route.ts'), 'utf8')
    const admin = readFileSync(path.join(process.cwd(), 'src/app/admin/sponsor-cards/page.tsx'), 'utf8')
    const allowlist = readFileSync(path.join(process.cwd(), 'scripts/check-db-writes.ts'), 'utf8')
    expect(page).toContain('sponsoredCardIsVisible(placement)')
    expect(page).toContain('scheduleSponsorImpression(')
    expect(page).not.toMatch(/await\s+scheduleSponsorImpression/)
    expect(route).toContain('scheduleSponsorGoClick(')
    expect(route).not.toMatch(/await\s+scheduleSponsorGoClick/)
    expect(admin).toContain('requireAdmin(')
    expect(admin).toContain('Impressions')
    expect(admin).toContain('/go clicks')
    expect(admin).not.toContain('ipHash')
    expect(allowlist).toContain("'src/lib/sponsor-impressions.ts'")
  })
})

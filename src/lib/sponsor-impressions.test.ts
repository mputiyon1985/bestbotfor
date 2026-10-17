import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { sponsorshipCreatives, sponsorshipDailyCounts, sponsorships } from './db/schema'
import { createTestDatabase } from '@/test/db'
import {
  approvedSponsorRedirectUrl,
  countsAsSponsorTraffic,
  incrementSponsorDaily,
  isBotUserAgent,
  listSponsorPlacementCounts,
  scheduleSponsorCardClick,
  scheduleSponsorImpression,
  utcDay,
  type SponsorTrafficSignal,
} from './sponsor-impressions'

const START = 1_700_000_000_000
const WEEK = 7 * 24 * 60 * 60 * 1000
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

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>['db']

async function insertCard(
  db: TestDb,
  input: {
    offering?: string
    status?: string
    paidAt?: number | null
    refundedAt?: number | null
    creativeStatus?: string
    approvedUrl?: string | null
  } = {},
): Promise<number> {
  const inserted = await db
    .insert(sponsorships)
    .values({
      stripeCheckoutSessionId: `cs_${Math.random().toString(16).slice(2)}`,
      offering: input.offering ?? 'placement_weekly',
      status: input.status ?? 'paid',
      company: 'Example Tools',
      email: 'sponsor@example.com',
      taskSlug: 'coding',
      createdAt: START,
      updatedAt: START,
      paidAt: input.paidAt === undefined ? START : input.paidAt,
      refundedAt: input.refundedAt ?? null,
    })
    .returning({ id: sponsorships.id })
  const sponsorshipId = inserted[0]?.id
  if (!sponsorshipId) throw new Error('missing sponsorship')
  const approved = (input.creativeStatus ?? 'approved') === 'approved'
  const url = input.approvedUrl === undefined ? 'https://example.com/widget' : input.approvedUrl
  await db.insert(sponsorshipCreatives).values({
    sponsorshipId,
    toolName: 'Widget',
    description: 'A useful coding tool.',
    url: url ?? 'https://example.com/widget',
    logoMime: 'image/png',
    logoBytes: PNG,
    status: input.creativeStatus ?? 'approved',
    contentHash: 'a'.repeat(64),
    approvedToolName: approved ? 'Widget' : null,
    approvedDescription: approved ? 'A useful coding tool.' : null,
    approvedUrl: approved ? url : null,
    approvedLogoMime: approved ? 'image/png' : null,
    approvedLogoBytes: approved ? PNG : null,
    approvedContentHash: approved ? 'a'.repeat(64) : null,
    approvedVersion: approved ? 1 : null,
    createdAt: START,
    updatedAt: START,
  })
  return sponsorshipId
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
    expect(source).not.toContain('scheduleSponsorGoClick')
    expect(source).not.toContain('bestTaskFromGoPage')
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

  it('counts a human click only for the approved card and refuses any other destination', async () => {
    const { db, close } = await createTestDatabase()
    const live = await insertCard(db)
    expect(await approvedSponsorRedirectUrl(db, live, START)).toBe('https://example.com/widget')
    expect(await approvedSponsorRedirectUrl(db, live, START + WEEK - 1)).toBe('https://example.com/widget')
    expect(await approvedSponsorRedirectUrl(db, live, START + WEEK)).toBeNull()
    expect(await approvedSponsorRedirectUrl(db, live, START - 1)).toBeNull()
    expect(await approvedSponsorRedirectUrl(db, live + 99, START)).toBeNull()

    const blocked = [
      'http://example.com/widget',
      'javascript:alert(1)',
      'https://user:pass@example.com/widget',
      'https://localhost/widget',
      'https://127.0.0.1/widget',
      'https://10.1.2.3/widget',
      'https://files.internal/widget',
    ]
    for (const approvedUrl of blocked) {
      const id = await insertCard(db, { approvedUrl })
      expect(await approvedSponsorRedirectUrl(db, id, START), approvedUrl).toBeNull()
    }

    const hidden = [
      insertCard(db, { refundedAt: START }),
      insertCard(db, { status: 'pending', paidAt: null }),
      insertCard(db, { creativeStatus: 'pending' }),
      insertCard(db, { creativeStatus: 'rejected' }),
      insertCard(db, { offering: 'newsletter_slot' }),
      insertCard(db, { approvedUrl: null }),
    ]
    for (const pending of hidden) {
      const id = await pending
      expect(await approvedSponsorRedirectUrl(db, id, START)).toBeNull()
    }

    const jobs: Array<() => Promise<void>> = []
    const schedule = (work: () => Promise<void>) => {
      jobs.push(work)
    }
    scheduleSponsorCardClick({ ...HUMAN, db, sponsorshipId: live, now: START, method: 'HEAD' }, schedule)
    scheduleSponsorCardClick(
      { ...HUMAN, db, sponsorshipId: live, now: START, userAgent: 'Mozilla/5.0 HeadlessChrome/120.0.0.0' },
      schedule,
    )
    scheduleSponsorCardClick({ ...HUMAN, db, sponsorshipId: live, now: START, purpose: 'prefetch' }, schedule)
    expect(jobs).toHaveLength(0)

    scheduleSponsorCardClick({ ...HUMAN, db, sponsorshipId: live, now: START }, schedule)
    expect(jobs).toHaveLength(1)
    await jobs[0]?.()
    const listed = await listSponsorPlacementCounts(db)
    const row = listed.find((placement) => placement.sponsorshipId === live)
    expect(row).toMatchObject({
      sponsorshipId: live,
      company: 'Example Tools',
      taskSlug: 'coding',
      toolName: 'Widget',
      days: [{ day: '2023-11-14', impressions: 0, goClicks: 1 }],
    })
    expect(JSON.stringify(listed)).not.toContain('sponsor@example.com')
    expect(row).not.toHaveProperty('email')
    await close()
  })

  it('is scheduled from the guide and the Sponsored card redirect, not from ranked Visit clicks', () => {
    const page = readFileSync(path.join(process.cwd(), 'src/app/best/[task]/page.tsx'), 'utf8')
    const ranked = readFileSync(path.join(process.cwd(), 'src/app/go/[slug]/route.ts'), 'utf8')
    const cardRoute = readFileSync(path.join(process.cwd(), 'src/app/go/s/[placementId]/route.ts'), 'utf8')
    const card = readFileSync(path.join(process.cwd(), 'src/components/sponsored-placement.tsx'), 'utf8')
    const admin = readFileSync(path.join(process.cwd(), 'src/app/admin/sponsors/page.tsx'), 'utf8')
    const allowlist = readFileSync(path.join(process.cwd(), 'scripts/check-db-writes.ts'), 'utf8')
    expect(page).toContain('sponsoredCardIsVisible(placement)')
    expect(page).toContain('scheduleSponsorImpression(')
    expect(page).not.toMatch(/await\s+scheduleSponsorImpression/)
    expect(ranked).not.toContain('scheduleSponsorGoClick')
    expect(ranked).not.toContain('scheduleSponsorCardClick')
    expect(ranked).not.toContain('sponsor-impressions')
    expect(cardRoute).toContain('approvedSponsorRedirectUrl(')
    expect(cardRoute).toContain('scheduleSponsorCardClick(')
    expect(cardRoute).not.toMatch(/await\s+scheduleSponsorCardClick/)
    expect(cardRoute).toContain("rateLimitKey(ip, 'sponsor-go')")
    expect(cardRoute).toContain('consumeRateLimit')
    expect(cardRoute).not.toContain('ipHash')
    expect(cardRoute).not.toContain('user_agent')
    expect(cardRoute).not.toContain('cookie')
    expect(cardRoute).not.toContain('user_id')
    expect(card).toContain('href={`/go/s/${placement.sponsorshipId}`}')
    expect(card).toContain('rel="sponsored nofollow"')
    expect(admin).toContain('requireAdmin(')
    expect(admin).toContain('Impressions')
    expect(admin).toContain('Card clicks')
    expect(admin).toContain('visits through the Sponsored card')
    expect(admin).not.toContain('/go clicks')
    expect(admin).not.toContain('ipHash')
    expect(allowlist).toContain("'src/lib/sponsor-impressions.ts'")
  })
})

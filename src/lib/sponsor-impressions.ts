import { after } from 'next/server'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Database } from './db/client'
import { sponsorshipCreatives, sponsorshipDailyCounts, sponsorships } from './db/schema'
import { withDeadline } from './deadline'
import { placementWindowMs } from './best-placement'
import { parseSponsorHttpsUrl } from './sponsor-card'
import { sanitizeSponsorCompany } from './sponsor-company'

/** A count write that is still running after this long is abandoned. The page does not wait. */
export const SPONSOR_COUNT_BUDGET_MS = 800

const DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/

/**
 * Crawler and preview clients. Matching is a case-insensitive substring of the
 * User-Agent. The header is not stored.
 */
const BOT_TOKENS = [
  'googlebot',
  'bingbot',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'sogou',
  'exabot',
  'facebot',
  'facebookexternalhit',
  'ia_archiver',
  'slurp',
  'semrush',
  'ahrefs',
  'mj12bot',
  'dotbot',
  'petalbot',
  'bytespider',
  'gptbot',
  'chatgpt-user',
  'claudebot',
  'amazonbot',
  'applebot',
  'twitterbot',
  'linkedinbot',
  'slackbot',
  'telegrambot',
  'discordbot',
  'pinterestbot',
  'redditbot',
  'embedly',
  'quora link preview',
  'vkshare',
  'w3c_validator',
  'headlesschrome',
  'lighthouse',
  'pagespeed',
  'pingdom',
  'uptimerobot',
  'wget',
  'curl/',
  'python-requests',
  'go-http-client',
  'axios/',
  'node-fetch',
  'scrapy',
  'phantomjs',
  'selenium',
  'playwright',
  'puppeteer',
  'spider',
  'crawler',
]

export type SponsorTrafficSignal = {
  method: string | null
  userAgent: string | null
  purpose: string | null
  secPurpose: string | null
  routerPrefetch: string | null
  middlewarePrefetch: string | null
}

type Schedule = (work: () => Promise<void>) => void

export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

export function isBotUserAgent(userAgent: string | null): boolean {
  const agent = userAgent?.trim().toLowerCase() ?? ''
  if (!agent) return true
  return BOT_TOKENS.some((token) => agent.includes(token))
}

/** A human GET document render. Prefetch, HEAD, and known bots are not impressions. */
export function countsAsSponsorTraffic(input: SponsorTrafficSignal): boolean {
  if (input.method !== 'GET') return false
  if (isBotUserAgent(input.userAgent)) return false
  const purpose = `${input.purpose ?? ''} ${input.secPurpose ?? ''}`.toLowerCase()
  if (purpose.includes('prefetch')) return false
  if (input.routerPrefetch === '1' || input.middlewarePrefetch === '1') return false
  return true
}

export async function incrementSponsorDaily(
  db: Database,
  sponsorshipId: number,
  day: string,
  metric: 'impressions' | 'go_clicks',
): Promise<void> {
  if (!Number.isInteger(sponsorshipId) || sponsorshipId < 1 || !DAY.test(day)) return
  const impressions = metric === 'impressions' ? 1 : 0
  const goClicks = metric === 'go_clicks' ? 1 : 0
  await db
    .insert(sponsorshipDailyCounts)
    .values({ sponsorshipId, day, impressions, goClicks })
    .onConflictDoUpdate({
      target: [sponsorshipDailyCounts.sponsorshipId, sponsorshipDailyCounts.day],
      set: {
        impressions: sql`${sponsorshipDailyCounts.impressions} + ${impressions}`,
        goClicks: sql`${sponsorshipDailyCounts.goClicks} + ${goClicks}`,
      },
    })
}

function safeAfter(work: () => Promise<void>): void {
  after(() => work())
}

function runCount(
  work: () => Promise<void>,
  schedule: Schedule,
  budgetMs: number,
): void {
  try {
    schedule(async () => {
      try {
        await withDeadline(work(), budgetMs)
      } catch (error) {
        console.error('sponsor count failed', error instanceof Error ? error.name : 'error')
      }
    })
  } catch (error) {
    console.error('sponsor count failed', error instanceof Error ? error.name : 'error')
  }
}

/** Schedules one impression after the response. The caller does not await it. */
export function scheduleSponsorImpression(
  input: SponsorTrafficSignal & { db: Database; sponsorshipId: number; now: number },
  schedule: Schedule = safeAfter,
  budgetMs = SPONSOR_COUNT_BUDGET_MS,
): void {
  if (!countsAsSponsorTraffic(input)) return
  const db = input.db
  const sponsorshipId = input.sponsorshipId
  const day = utcDay(input.now)
  runCount(() => incrementSponsorDaily(db, sponsorshipId, day, 'impressions'), schedule, budgetMs)
}

/**
 * The https URL of one approved, paid, in-window, unrefunded card.
 * The caller redirects only to this value. A missing or invalid card is null.
 */
export async function approvedSponsorRedirectUrl(db: Database, placementId: number, now: number): Promise<string | null> {
  if (!Number.isInteger(placementId) || placementId < 1 || !Number.isFinite(now)) return null
  const rows = await db
    .select({
      offering: sponsorships.offering,
      status: sponsorships.status,
      paidAt: sponsorships.paidAt,
      refundedAt: sponsorships.refundedAt,
      approvedUrl: sponsorshipCreatives.approvedUrl,
      creativeStatus: sponsorshipCreatives.status,
    })
    .from(sponsorships)
    .innerJoin(
      sponsorshipCreatives,
      and(eq(sponsorshipCreatives.sponsorshipId, sponsorships.id), eq(sponsorshipCreatives.status, 'approved')),
    )
    .where(eq(sponsorships.id, placementId))
    .orderBy(desc(sponsorshipCreatives.updatedAt))
  const row = rows[0]
  if (!row || row.status !== 'paid' || row.refundedAt != null || row.creativeStatus !== 'approved') return null
  const windowMs = placementWindowMs(row.offering)
  const start = row.paidAt
  if (windowMs == null || start == null || now < start || now >= start + windowMs) return null
  if (!row.approvedUrl) return null
  return parseSponsorHttpsUrl(row.approvedUrl)
}

/** Schedules the daily click total for one Sponsored card. The caller does not await it. */
export function scheduleSponsorCardClick(
  input: SponsorTrafficSignal & { db: Database; sponsorshipId: number; now: number },
  schedule: Schedule = safeAfter,
  budgetMs = SPONSOR_COUNT_BUDGET_MS,
): void {
  if (!countsAsSponsorTraffic(input)) return
  const db = input.db
  const sponsorshipId = input.sponsorshipId
  const day = utcDay(input.now)
  runCount(() => incrementSponsorDaily(db, sponsorshipId, day, 'go_clicks'), schedule, budgetMs)
}

export type SponsorPlacementDay = {
  day: string
  impressions: number
  goClicks: number
}

export type SponsorPlacementCount = {
  sponsorshipId: number
  company: string | null
  taskSlug: string | null
  offering: string
  toolName: string
  days: SponsorPlacementDay[]
}

/** Approved placements and their daily totals. Email and visitor identifiers are not selected. */
export async function listSponsorPlacementCounts(db: Database): Promise<SponsorPlacementCount[]> {
  const rows = await db
    .select({
      sponsorshipId: sponsorships.id,
      company: sponsorships.company,
      taskSlug: sponsorships.taskSlug,
      offering: sponsorships.offering,
      toolName: sponsorshipCreatives.toolName,
      updatedAt: sponsorshipCreatives.updatedAt,
    })
    .from(sponsorships)
    .innerJoin(
      sponsorshipCreatives,
      and(eq(sponsorshipCreatives.sponsorshipId, sponsorships.id), eq(sponsorshipCreatives.status, 'approved')),
    )
    .orderBy(desc(sponsorshipCreatives.updatedAt))

  const placements: SponsorPlacementCount[] = []
  const seen = new Set<number>()
  for (const row of rows) {
    if (seen.has(row.sponsorshipId)) continue
    seen.add(row.sponsorshipId)
    const company = sanitizeSponsorCompany(row.company ?? '')
    const toolName = sanitizeSponsorCompany(row.toolName)
    placements.push({
      sponsorshipId: row.sponsorshipId,
      company: company.length > 0 ? company : null,
      taskSlug: row.taskSlug,
      offering: row.offering,
      toolName: toolName.length > 0 ? toolName : 'Tool card',
      days: [],
    })
  }

  if (placements.length === 0) return placements
  const counts = await db
    .select({
      sponsorshipId: sponsorshipDailyCounts.sponsorshipId,
      day: sponsorshipDailyCounts.day,
      impressions: sponsorshipDailyCounts.impressions,
      goClicks: sponsorshipDailyCounts.goClicks,
    })
    .from(sponsorshipDailyCounts)
    .where(
      inArray(
        sponsorshipDailyCounts.sponsorshipId,
        placements.map((placement) => placement.sponsorshipId),
      ),
    )
    .orderBy(desc(sponsorshipDailyCounts.day))

  const byId = new Map(placements.map((placement) => [placement.sponsorshipId, placement]))
  for (const count of counts) {
    byId.get(count.sponsorshipId)?.days.push({
      day: count.day,
      impressions: count.impressions,
      goClicks: count.goClicks,
    })
  }
  return placements
}

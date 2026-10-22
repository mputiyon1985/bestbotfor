import { getDomain } from 'tldts'
import type { FreePlanFields } from './catalog-types'

/** A free-plan note older than this sends its page back to noindex. */
export const FREE_PLAN_MAX_AGE_DAYS = 90

/** The five jobs with a /best/[task]/free page (docs/specs/seo-20-pages, pages 16 to 20). */
export const FREE_PAGE_TASKS = ['coding', 'images', 'video', 'voice', 'meetings'] as const

/** One pick plus up to five free alternatives, as the spec's meta description says. */
export const FREE_PAGE_TOOL_COUNT = 6

/** A free page needs at least this many free tools to exist (spec: the ≥3-free-tools rule). */
export const FREE_PAGE_MIN_TOOLS = 3

export function isFreePageTask(slug: string): boolean {
  return (FREE_PAGE_TASKS as readonly string[]).includes(slug)
}

export type FreePlanStatus = 'fresh' | 'stale' | 'missing'

export type FreePlanInput = {
  slug: string
  url: string
  allowedHosts: readonly string[]
  freePlan: Partial<FreePlanFields> | null | undefined
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Midnight UTC for a strict YYYY-MM-DD date, or null. */
export function parseCheckedAt(value: string | undefined | null): number | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const date = new Date(time)
  if (date.toISOString().slice(0, 10) !== value) return null
  return time
}

/**
 * True when the source is an https URL on the tool's own domain (its catalog
 * URL or an allowed redirect host) or on a hand-reviewed vendor domain.
 */
export function isOfficialSource(source: string | undefined | null, tool: Pick<FreePlanInput, 'url' | 'allowedHosts'>, extraDomains: readonly string[] = []): boolean {
  if (!source) return false
  let url: URL
  try {
    url = new URL(source)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false
  const domain = getDomain(url.hostname)
  if (!domain) return false
  const official = new Set<string>(extraDomains)
  for (const host of [safeHost(tool.url), ...tool.allowedHosts]) {
    const toolDomain = host ? getDomain(host) : null
    if (toolDomain) official.add(toolDomain)
  }
  return official.has(domain)
}

function safeHost(value: string): string | null {
  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}

/**
 * fresh: note, official source and a checked date no more than 90 days old
 * (and not in the future). stale: all three present but the date is too old.
 * missing: any field absent, blank, unparseable or unofficial.
 */
export function freePlanStatus(tool: FreePlanInput, now: number, extraDomains: readonly string[] = []): FreePlanStatus {
  const plan = tool.freePlan
  if (!plan?.freePlanNote?.trim()) return 'missing'
  if (!isOfficialSource(plan.freePlanSource, tool, extraDomains)) return 'missing'
  const checked = parseCheckedAt(plan.freePlanCheckedAt)
  if (checked == null || checked > now) return 'missing'
  return now - checked <= FREE_PLAN_MAX_AGE_DAYS * DAY_MS ? 'fresh' : 'stale'
}

/**
 * A free page is indexed only when it shows enough tools and every tool it
 * shows is fresh. Anything else keeps it noindex and out of the sitemap.
 */
export function freePageIndexable(statuses: readonly FreePlanStatus[]): boolean {
  return statuses.length >= FREE_PAGE_MIN_TOOLS && statuses.every((status) => status === 'fresh')
}

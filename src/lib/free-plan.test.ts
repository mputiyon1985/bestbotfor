import { describe, expect, it, vi } from 'vitest'
import { freePlanHolds, freePlanNotes, freePlanOfficialDomains } from '@/data/free-plan-notes'
import { toolSeeds } from '@/data/catalog'
import { catalogFromSeeds } from '@/test/catalog-from-seeds'
import { buildFreePage } from './free-page'
import { freePageClock, freePageHooksEnabled, FREE_PLAN_DROP_HEADER, FREE_PLAN_NOW_HEADER } from './free-page-hooks'
import {
  FREE_PAGE_TASKS,
  FREE_PAGE_TOOL_COUNT,
  FREE_PLAN_MAX_AGE_DAYS,
  freePageIndexable,
  freePlanStatus,
  isOfficialSource,
  parseCheckedAt,
} from './free-plan'
import { pageMetadata } from './metadata'
import { toolsForTask } from './recommend'
import { bestFreeDescription, bestFreeTitle, SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from './seo-pages'

const CHECKED = '2026-10-18'
const checkedAt = Date.UTC(2026, 9, 18)
const DAY = 24 * 60 * 60 * 1000
const tool = { slug: 'cursor', url: 'https://cursor.com', allowedHosts: ['www.cursor.com'] }
const plan = { freePlanNote: 'Free plan with limited requests.', freePlanSource: 'https://cursor.com/pricing', freePlanCheckedAt: CHECKED }
const catalog = catalogFromSeeds()

describe('free-plan status', () => {
  it('is fresh up to 90 days after the check, and stale after', () => {
    expect(freePlanStatus({ ...tool, freePlan: plan }, checkedAt)).toBe('fresh')
    expect(freePlanStatus({ ...tool, freePlan: plan }, checkedAt + FREE_PLAN_MAX_AGE_DAYS * DAY)).toBe('fresh')
    expect(freePlanStatus({ ...tool, freePlan: plan }, checkedAt + FREE_PLAN_MAX_AGE_DAYS * DAY + 1)).toBe('stale')
    expect(freePlanStatus({ ...tool, freePlan: plan }, Date.UTC(2027, 2, 1))).toBe('stale')
  })

  it('is missing when any of the three fields is absent, blank, malformed or in the future', () => {
    expect(freePlanStatus({ ...tool, freePlan: null }, checkedAt)).toBe('missing')
    expect(freePlanStatus({ ...tool, freePlan: { ...plan, freePlanNote: '  ' } }, checkedAt)).toBe('missing')
    expect(freePlanStatus({ ...tool, freePlan: { ...plan, freePlanSource: '' } }, checkedAt)).toBe('missing')
    expect(freePlanStatus({ ...tool, freePlan: { ...plan, freePlanCheckedAt: '' } }, checkedAt)).toBe('missing')
    expect(freePlanStatus({ ...tool, freePlan: { ...plan, freePlanCheckedAt: '2026-02-30' } }, checkedAt)).toBe('missing')
    expect(freePlanStatus({ ...tool, freePlan: { ...plan, freePlanCheckedAt: '10/18/2026' } }, checkedAt)).toBe('missing')
    expect(freePlanStatus({ ...tool, freePlan: { ...plan, freePlanCheckedAt: '2026-10-19' } }, checkedAt)).toBe('missing')
  })

  it('only accepts an https source on the vendor’s own domain', () => {
    expect(isOfficialSource('https://cursor.com/pricing', tool)).toBe(true)
    expect(isOfficialSource('https://docs.cursor.com/plans', tool)).toBe(true)
    expect(isOfficialSource('http://cursor.com/pricing', tool)).toBe(false)
    expect(isOfficialSource('https://cursor.com.evil.example/pricing', tool)).toBe(false)
    expect(isOfficialSource('https://reviews.example/cursor', tool)).toBe(false)
    expect(isOfficialSource('https://user:pw@cursor.com/pricing', tool)).toBe(false)
    expect(isOfficialSource('not a url', tool)).toBe(false)
    expect(isOfficialSource('https://claude.com/pricing', { url: 'https://claude.ai', allowedHosts: [] })).toBe(false)
    expect(isOfficialSource('https://claude.com/pricing', { url: 'https://claude.ai', allowedHosts: [] }, ['claude.com'])).toBe(true)
  })

  it('indexes a page only when it has at least three tools and all are fresh', () => {
    expect(freePageIndexable(['fresh', 'fresh', 'fresh'])).toBe(true)
    expect(freePageIndexable(['fresh', 'fresh', 'stale'])).toBe(false)
    expect(freePageIndexable(['fresh', 'missing', 'fresh'])).toBe(false)
    expect(freePageIndexable(['fresh', 'fresh'])).toBe(false)
    expect(parseCheckedAt(CHECKED)).toBe(checkedAt)
  })
})

describe('free-plan catalog data', () => {
  const seeds = new Map(toolSeeds.map((seed) => [seed.slug, seed]))

  it('has a catalog tool, a note, an official source and a valid date for every entry', () => {
    const entries = Object.entries(freePlanNotes)
    expect(entries.length).toBe(64)
    for (const [slug, fields] of entries) {
      const seed = seeds.get(slug)
      expect(seed, slug).toBeTruthy()
      if (!seed) continue
      expect(fields.freePlanNote.trim().length, slug).toBeGreaterThan(0)
      expect(isOfficialSource(fields.freePlanSource, seed, freePlanOfficialDomains[slug] ?? []), `${slug} ${fields.freePlanSource}`).toBe(true)
      expect(parseCheckedAt(fields.freePlanCheckedAt), slug).not.toBeNull()
    }
  })

  it('keeps every note official across the Oct 18 catalog host moves', () => {
    // The catalog patch moves these tools to new hosts. Each note must pass on the old and the new catalog URL.
    const moves: Record<string, { url: string; allowedHosts: string[] }> = {
      playground: { url: 'https://playgroundai.com', allowedHosts: ['playgroundai.com'] },
      runway: { url: 'https://runway.com', allowedHosts: ['runway.com'] },
      'kilo-code': { url: 'https://kilo.ai', allowedHosts: ['kilo.ai'] },
      podcastle: { url: 'https://async.com', allowedHosts: ['async.com'] },
    }
    for (const [slug, moved] of Object.entries(moves)) {
      const fields = freePlanNotes[slug]
      expect(fields, slug).toBeTruthy()
      if (!fields) continue
      expect(isOfficialSource(fields.freePlanSource, moved, freePlanOfficialDomains[slug] ?? []), slug).toBe(true)
    }
  })

  it('holds the unverified tools and gives them no note', () => {
    expect(Object.keys(freePlanHolds).sort()).toEqual(['picsart'])
    for (const slug of Object.keys(freePlanHolds)) expect(freePlanNotes[slug]).toBeUndefined()
  })
})

describe('free page', () => {
  // The newest free-plan check (TwinMind) is 2026-10-22, so the page clock starts there.
  const at = Date.UTC(2026, 9, 22, 16)

  it('lists the top six free tools in /result budget=free order, without held tools', () => {
    for (const task of FREE_PAGE_TASKS) {
      const page = buildFreePage(toolsForTask(catalog, task), at)
      expect(page.tools.length, task).toBe(FREE_PAGE_TOOL_COUNT)
      for (const item of page.tools) {
        expect(item.hasFreeTier || item.pricingModel === 'free', item.slug).toBe(true)
        expect(item.slug in freePlanHolds).toBe(false)
      }
    }
    const images = buildFreePage(toolsForTask(catalog, 'images'), at)
    expect(images.tools.map((item) => item.slug)).not.toContain('picsart')
  })

  it('fresh: every page is indexable with today’s notes', () => {
    for (const task of FREE_PAGE_TASKS) expect(buildFreePage(toolsForTask(catalog, task), at).indexable, task).toBe(true)
  })

  it('stale: every page falls back to noindex 91 days after the check', () => {
    for (const task of FREE_PAGE_TASKS) {
      const page = buildFreePage(toolsForTask(catalog, task), Date.UTC(2026, 9, 22) + 91 * DAY)
      expect(page.indexable, task).toBe(false)
      expect(page.tools.every((item) => item.freePlanStatus === 'stale')).toBe(true)
    }
  })

  it('missing: one tool without a note sends its page to noindex', () => {
    const coding = buildFreePage(toolsForTask(catalog, 'coding'), at)
    const first = coding.tools[0]!.slug
    const dropped = buildFreePage(toolsForTask(catalog, 'coding'), at, { drop: [first] })
    expect(dropped.indexable).toBe(false)
    expect(dropped.tools[0]!.freePlanStatus).toBe('missing')
    expect(dropped.tools[0]!.freePlan).toBeNull()
    const noNotes = buildFreePage(toolsForTask(catalog, 'coding'), at, {}, {})
    expect(noNotes.indexable).toBe(false)
  })

  it('keeps titles and descriptions inside the spec limits, and drops the checked claim when notes are not fresh', () => {
    for (const task of catalog.tasks.filter((item) => (FREE_PAGE_TASKS as readonly string[]).includes(item.slug))) {
      expect(bestFreeTitle(task.name).length).toBeLessThanOrEqual(SEO_TITLE_MAX)
      expect(bestFreeDescription(task.name, true).length).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX)
      expect(bestFreeDescription(task.name, false)).not.toContain('Checked against vendor pages')
    }
    expect(bestFreeTitle('Write code')).toBe('Best Free AI Tool for Writing Code (2026)')
  })

  it('maps the gate to noindex, follow in production', () => {
    const previous = process.env.VERCEL_ENV
    process.env.VERCEL_ENV = 'production'
    expect(pageMetadata({ title: 't', description: 'd', path: '/best/coding/free', noIndex: true, follow: true }).robots).toEqual({ index: false, follow: true })
    expect(pageMetadata({ title: 't', description: 'd', path: '/best/coding/free', noIndex: false, follow: true }).robots).toEqual({ index: true, follow: true })
    process.env.VERCEL_ENV = previous
  })
})

describe('free page test hooks', () => {
  const headers = (values: Record<string, string>) => (name: string) => values[name] ?? null
  const real = Date.UTC(2026, 9, 18)

  it('ignores the headers unless BBF_E2E_HOOKS is 1 outside Vercel and production', () => {
    const pinned = { [FREE_PLAN_NOW_HEADER]: '2027-03-01', [FREE_PLAN_DROP_HEADER]: 'cursor' }
    expect(freePageClock(headers(pinned), real, {})).toEqual({ now: real, overrides: {} })
    expect(freePageClock(headers(pinned), real, { BBF_E2E_HOOKS: '1', VERCEL_ENV: 'production' })).toEqual({ now: real, overrides: {} })
    expect(freePageClock(headers(pinned), real, { BBF_E2E_HOOKS: '1', VERCEL: '1' })).toEqual({ now: real, overrides: {} })
    expect(freePageClock(headers(pinned), real, { BBF_E2E_HOOKS: 'true' })).toEqual({ now: real, overrides: {} })
    expect(freePageHooksEnabled({ BBF_E2E_HOOKS: '1', VERCEL_ENV: 'test' })).toBe(true)
    expect(freePageClock(headers(pinned), real, { BBF_E2E_HOOKS: '1', VERCEL_ENV: 'test' })).toEqual({
      now: Date.UTC(2027, 2, 1),
      overrides: { drop: ['cursor'] },
    })
  })
})

describe('free page sitemap', () => {
  it('lists a free page only when it is indexable', async () => {
    vi.resetModules()
    vi.doMock('next/headers', () => ({ headers: async () => new Headers() }))
    vi.doMock('@/lib/catalog', () => ({
      listPublicSlugs: async () => ({ tasks: ['coding', 'writing'], tools: [] }),
      listTaskCandidates: async (slug: string) => ({ task: catalog.tasks.find((task) => task.slug === slug), tools: toolsForTask(catalog, slug) }),
    }))
    const fresh = vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 18, 16))
    const { default: sitemap } = await import('@/app/sitemap')
    let paths = (await sitemap()).map((entry) => new URL(entry.url).pathname)
    expect(paths).toContain('/best/coding/free')
    expect(paths).not.toContain('/best/writing/free')
    fresh.mockReturnValue(Date.UTC(2027, 2, 1))
    paths = (await sitemap()).map((entry) => new URL(entry.url).pathname)
    expect(paths).not.toContain('/best/coding/free')
    fresh.mockRestore()
    vi.doUnmock('next/headers')
    vi.doUnmock('@/lib/catalog')
  })
})

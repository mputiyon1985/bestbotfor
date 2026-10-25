import { describe, expect, it } from 'vitest'
import { CATEGORY_GUIDES } from '@/content/category-guides'
import { NOVA_COPY_PUBLISHED, novaCopy, novaDraftSlugs } from '@/content/nova-comparisons'
import { toolSeeds } from '@/data/catalog'
import { catalogFromSeeds } from '@/test/catalog-from-seeds'

/**
 * Guard: every rating and rank written into the static guide and comparison copy must match the rating and
 * category rank the catalog computes from src/data/scores-v2.3.csv (what the live tool pages show).
 * A ratings batch that moves a rank fails here until the copy is refreshed.
 */
const catalog = catalogFromSeeds()
const slugByName = new Map(toolSeeds.map((tool) => [tool.name.toLowerCase(), tool.slug]))
const ALIASES: Record<string, string> = { Otter: 'otter', Fireflies: 'fireflies' }

type Claim = { where: string; name: string; text: string }

function computed(name: string): { score: string; rank: string; rankNoCategory: string; tied: boolean } | null {
  const slug = ALIASES[name] ?? slugByName.get(name.toLowerCase())
  expect(slug, `unknown tool name in copy: ${name}`).toBeTruthy()
  const editorial = catalog.tools.find((tool) => tool.slug === slug)?.editorial
  if (!editorial) return null
  const rank = editorial.categoryRankDisplay
  return { score: editorial.overall.toFixed(1), rank, rankNoCategory: rank.replace(/ in .+$/, ''), tied: editorial.tied }
}

function guideClaims(): Claim[] {
  const claims: Claim[] = []
  for (const guide of CATEGORY_GUIDES) {
    for (const match of guide.body.matchAll(/## Our pick: ([^\n]+)\n\n\*\*Match for this job:\*\* \d+%\. \*\*Our rating:\*\* (.+?)\. \*\*Skill level/g)) {
      claims.push({ where: `guide ${guide.category} pick`, name: match[1]!, text: match[2]! })
    }
    for (const match of guide.body.matchAll(/\*\*([^*\n]+): \d+% match\.\*\* Our rating: ([^.]+\.\d[^.]*|[^.]+)\./g)) {
      claims.push({ where: `guide ${guide.category} alternative`, name: match[1]!, text: `short:${match[2]!}` })
    }
    for (const match of guide.body.matchAll(/([A-Z][\w.]*) \((\d\.\d, #\d+ of \d+)\)/g)) {
      claims.push({ where: `guide ${guide.category} inline`, name: match[1]!, text: `short:${match[2]!}` })
    }
  }
  return claims
}

function comparisonClaims(): Claim[] {
  const claims: Claim[] = []
  for (const slug of novaDraftSlugs()) {
    const copy = novaCopy(slug, new Set([slug])) ?? ''
    for (const line of copy.split('\n')) {
      if (!line.startsWith('| ') || line.startsWith('| Tool ') || line.startsWith('|---')) continue
      const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean)
      const rating = cells.find((cell) => /^\d\.\d\/5( \(.+\))?$/.test(cell) || cell === 'Unrated')
      if (rating) claims.push({ where: `comparison ${slug}`, name: cells[0]!, text: `table:${rating}` })
    }
  }
  return claims
}

// A tie label ("Tied · ") is optional in tables and inline mentions, required on guide picks, and never allowed
// where the ratings have no tie.
function check(claim: Claim): string | null {
  const truth = computed(claim.name)
  const label = `${claim.where} (${claim.name}): "${claim.text}"`
  if (claim.text.includes('Tied · ') && !truth?.tied) return `${label} but not tied`
  // Guide picks mirror the tool page's rank line, which labels ties.
  if (claim.where.endsWith(' pick') && truth?.tied && !claim.text.includes('Tied · ')) return `${label} but is tied`
  claim = { ...claim, text: claim.text.replace('Tied · ', '') }
  if (claim.text.startsWith('table:')) {
    const text = claim.text.slice('table:'.length)
    if (text === 'Unrated') return truth ? `${label} but rated ${truth.score} (${truth.rank})` : null
    if (!truth) return `${label} but Unrated`
    const [, score, rank] = /^(\d\.\d)\/5(?: \((.+)\))?$/.exec(text) ?? []
    if (score !== truth.score) return `${label} but rated ${truth.score}`
    if (rank !== undefined && rank !== truth.rank) return `${label} but rank is "${truth.rank}"`
    return null
  }
  if (claim.text.startsWith('short:')) {
    const text = claim.text.slice('short:'.length)
    if (!truth) return `${label} but Unrated`
    return text === `${truth.score}, ${truth.rankNoCategory}` ? null : `${label} but is "${truth.score}, ${truth.rankNoCategory}"`
  }
  if (claim.text === 'unrated') return truth ? `${label} but rated ${truth.score} (${truth.rank})` : null
  if (!truth) return `${label} but Unrated`
  return claim.text === `${truth.score}, ${truth.rank}` ? null : `${label} but is "${truth.score}, ${truth.rank}"`
}

describe('rank text in guides and comparisons matches the computed ratings', () => {
  it('finds the claims it guards', () => {
    expect(guideClaims().length).toBeGreaterThanOrEqual(CATEGORY_GUIDES.length)
    expect(comparisonClaims().length).toBeGreaterThan(20)
    expect(NOVA_COPY_PUBLISHED.size).toBeGreaterThan(0)
  })

  it('has no stale rating or rank in category guides', () => {
    expect(guideClaims().map(check).filter(Boolean)).toEqual([])
  })

  it('has no stale rating or rank in comparison copy', () => {
    expect(comparisonClaims().map(check).filter(Boolean)).toEqual([])
  })
})

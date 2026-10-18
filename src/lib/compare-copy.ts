import { compareCopyFor, type CompareCopy, type CompareRow } from '@/data/compare-copy'
import type { CatalogTool } from './catalog-types'
import { skillLabel } from './format'
import { formatScore, publicScore } from './score-visibility'

const FIT_TOKEN = /\{\{(a|b):([a-z0-9-]+)\}\}/g

export type CompareTableRow = {
  label: string
  a: string
  b: string
  source: string
}

export type CompareView = {
  slug: string
  metaTitle: string
  metaDescription: string
  heading: string
  nameA: string
  nameB: string
  verdict: string
  verdictPlain: string
  checkedLine: string
  pickAHeading: string
  pickBHeading: string
  pickA: string[]
  pickB: string[]
  rows: CompareTableRow[]
  secondaryNote: string
  cta: string
  sources: readonly string[]
  ranking?: { href: string; label: string }
}

export function plainCopy(text: string): string {
  return text.replaceAll('**', '')
}

export function inlineParts(text: string): { strong: boolean; text: string }[] {
  const parts = text.split('**')
  return parts.map((part, index) => ({ strong: index % 2 === 1, text: part })).filter((part) => part.text.length > 0)
}

/** UTC calendar day, so the ElevenLabs promo cutoff does not depend on the server's zone. */
export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function fillFitTokens(template: string, a: CatalogTool, b: CatalogTool): string {
  return template.replace(FIT_TOKEN, (_match, side: string, task: string) => {
    const tool = side === 'a' ? a : b
    const fit = tool.fits.find((row) => row.taskSlug === task)
    return fit ? String(fit.score) : 'not ranked'
  })
}

export function ratingCell(tool: CatalogTool, showScores: boolean): string | null {
  if (!showScores) return null
  const score = publicScore(tool.editorial, true)
  if (!score || !tool.editorial) return 'Not yet rated'
  if (tool.editorial.hideRank || !tool.editorial.categoryRankDisplay) return formatScore(score.overall)
  return `${formatScore(score.overall)} (${tool.editorial.categoryRankDisplay})`
}

function fitCell(tool: CatalogTool, task: string): string {
  const fit = tool.fits.find((row) => row.taskSlug === task)
  return fit ? String(fit.score) : 'Not ranked'
}

function textCell(row: Extract<CompareRow, { kind: 'text' }>, side: 'a' | 'b', today: string): string {
  if (side === 'a' && row.aAfter && today > row.aAfter.after) return row.aAfter.text
  return side === 'a' ? row.a : row.b
}

export function resolveRows(
  copy: CompareCopy,
  a: CatalogTool,
  b: CatalogTool,
  today: string,
  showScores: boolean,
): CompareTableRow[] {
  const rows: CompareTableRow[] = []
  for (const row of copy.rows) {
    if (row.kind === 'rating') {
      const left = ratingCell(a, showScores)
      const right = ratingCell(b, showScores)
      if (left === null || right === null) continue
      rows.push({ label: row.label, a: left, b: right, source: row.source })
      continue
    }
    if (row.kind === 'fit') {
      rows.push({ label: row.label, a: fitCell(a, row.task), b: fitCell(b, row.task), source: row.source })
      continue
    }
    if (row.kind === 'skill') {
      rows.push({
        label: row.label,
        a: skillLabel[a.skillLevel],
        b: skillLabel[b.skillLevel],
        source: row.source,
      })
      continue
    }
    rows.push({
      label: row.label,
      a: textCell(row, 'a', today),
      b: textCell(row, 'b', today),
      source: row.source,
    })
  }
  return rows
}

/**
 * Curated page model. Null when this pair has no hand-written copy.
 * Fit scores and Our rating are read from the tools, not from the snapshot in the handoff.
 */
export function compareView(
  a: CatalogTool,
  b: CatalogTool,
  options?: { today?: string; showScores?: boolean },
): CompareView | null {
  const copy = compareCopyFor(`${a.slug}-vs-${b.slug}`)
  if (!copy) return null
  const today = options?.today ?? utcDay()
  const showScores = options?.showScores ?? true
  const verdict = fillFitTokens(copy.verdict, a, b)
  const rows = resolveRows(copy, a, b, today, showScores)
  return {
    slug: copy.slug,
    metaTitle: copy.metaTitle,
    metaDescription: copy.metaDescription,
    heading: copy.heading,
    nameA: copy.nameA,
    nameB: copy.nameB,
    verdict,
    verdictPlain: plainCopy(verdict),
    checkedLine: copy.checkedLine,
    pickAHeading: copy.pickAHeading,
    pickBHeading: copy.pickBHeading,
    pickA: copy.pickA.map((item) => fillFitTokens(item, a, b)),
    pickB: copy.pickB.map((item) => fillFitTokens(item, a, b)),
    rows,
    secondaryNote: visibleSecondaryNote(
      rows.flatMap((row) => [row.a, row.b]),
      copy.secondaryNote,
    ),
    cta: copy.cta,
    sources: copy.sources,
    ranking: copy.ranking,
  }
}

const SECONDARY_MARKER = ' [S]'

/** The legend is only useful when a comparison cell still carries the marker. Source ids such as [S1] do not count. */
export function visibleSecondaryNote(cells: readonly string[], legend: string): string {
  return cells.some((cell) => cell.includes(SECONDARY_MARKER)) ? legend : ''
}

/** Table cells keep the marker. FAQ JSON-LD does not, because that payload has no legend. */
export function withoutSecondaryMarker(text: string): string {
  return text.replaceAll(SECONDARY_MARKER, '')
}

export function compareCostAnswer(
  view: CompareView | null,
  fallback: { nameA: string; priceA: string; nameB: string; priceB: string },
): string {
  const paid = view?.rows.find((row) => row.label === 'Paid from')
  const raw =
    view && paid
      ? `${view.nameA}: ${paid.a}. ${view.nameB}: ${paid.b}. Confirm the current price on each site.`
      : `${fallback.nameA}: ${fallback.priceA}. ${fallback.nameB}: ${fallback.priceB}. Confirm the current price on each site.`
  return withoutSecondaryMarker(raw)
}

export function compareFaqs(input: {
  nameA: string
  nameB: string
  verdict: string
  cost: string
}): { question: string; answer: string }[] {
  return [
    {
      question: `Which is better, ${input.nameA} or ${input.nameB}?`,
      answer: withoutSecondaryMarker(input.verdict),
    },
    { question: 'What do they cost?', answer: withoutSecondaryMarker(input.cost) },
  ]
}

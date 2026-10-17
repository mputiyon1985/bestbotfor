import { compareCopyFor, type CompareCopy, type CompareRow } from '@/data/compare-copy'
import type { CatalogTool } from './catalog-types'
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
    rows: resolveRows(copy, a, b, today, showScores),
    secondaryNote: copy.secondaryNote,
    cta: copy.cta,
    sources: copy.sources,
    ranking: copy.ranking,
  }
}

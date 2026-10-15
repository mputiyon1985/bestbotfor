import type { CatalogTool } from './catalog-types'

export type ComparisonRow = {
  taskName: string
  aScore: number | null
  bScore: number | null
  aNotes: string | null
  bNotes: string | null
}

export function comparisonRows(a: CatalogTool, b: CatalogTool): ComparisonRow[] {
  const slugs = new Set([...a.fits.map((fit) => fit.taskSlug), ...b.fits.map((fit) => fit.taskSlug)])
  const rows: ComparisonRow[] = []
  for (const slug of slugs) {
    const aFit = a.fits.find((fit) => fit.taskSlug === slug)
    const bFit = b.fits.find((fit) => fit.taskSlug === slug)
    rows.push({
      taskName: aFit?.taskName ?? bFit?.taskName ?? slug,
      aScore: aFit?.score ?? null,
      bScore: bFit?.score ?? null,
      aNotes: aFit?.notes ?? null,
      bNotes: bFit?.notes ?? null,
    })
  }
  rows.sort((left, right) => {
    const leftMax = Math.max(left.aScore ?? 0, left.bScore ?? 0)
    const rightMax = Math.max(right.aScore ?? 0, right.bScore ?? 0)
    return rightMax - leftMax || left.taskName.localeCompare(right.taskName)
  })
  return rows
}

export function comparisonSummary(a: CatalogTool, b: CatalogTool, rows: ComparisonRow[]): string {
  const aWins = rows.filter((row) => (row.aScore ?? -1) > (row.bScore ?? -1))
  const bWins = rows.filter((row) => (row.bScore ?? -1) > (row.aScore ?? -1))
  const aBest = aWins[0]
  const bBest = bWins[0]
  if (aBest && bBest) {
    return `${a.name} is the stronger pick for ${aBest.taskName.toLowerCase()}. ${b.name} is the stronger pick for ${bBest.taskName.toLowerCase()}.`
  }
  if (aBest) return `${a.name} scores higher on the jobs we compared.`
  if (bBest) return `${b.name} scores higher on the jobs we compared.`
  return `${a.name} and ${b.name} are close on the jobs in this catalog.`
}

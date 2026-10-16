import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { EditorialSeed, EditorialSeedPoint } from '@/lib/editorial'

/**
 * Forge batch 1, reviewed 2026-10-16. The CSV is the source of truth.
 * `source_urls` is stored on the score row and is not rendered.
 * Each pro and con keeps its own source URL, and that link is the one the page shows.
 * Later batches in a future file stay out until this loader is told to include them.
 */
const BATCH = '1'
const csvPath = path.join(process.cwd(), 'src/data/scores-pros-cons.csv')

export const editorialSeeds: EditorialSeed[] = editorialRowsFromCsv(readFileSync(csvPath, 'utf8'))

export function editorialRowsFromCsv(text: string, batch = BATCH): EditorialSeed[] {
  const table = parseCsv(text)
  const header = table[0]
  if (!header) throw new Error('Editorial CSV is empty')
  const index = new Map(header.map((name, position) => [name, position]))
  for (const column of [
    'slug',
    'features',
    'value',
    'ease',
    'quality',
    'overall',
    'rationale',
    'pro1',
    'pro1_source',
    'con1',
    'con1_source',
    'source_urls',
    'reviewed_at',
    'batch',
  ]) {
    if (!index.has(column)) throw new Error(`Editorial CSV is missing ${column}`)
  }

  const rows: EditorialSeed[] = []
  for (const record of table.slice(1)) {
    const value = (column: string) => {
      const position = index.get(column)
      return (position === undefined ? '' : (record[position] ?? '')).trim()
    }
    if (value('batch') !== batch) continue
    const slug = value('slug')
    if (!slug) throw new Error('Editorial CSV has a batch row with no slug')
    rows.push({
      slug,
      features: point(slug, 'features', value('features')),
      value: point(slug, 'value', value('value')),
      ease: point(slug, 'ease', value('ease')),
      quality: point(slug, 'quality', value('quality')),
      overall: point(slug, 'overall', value('overall')),
      rationale: value('rationale'),
      sources: value('source_urls').split(/\s+/).filter(Boolean),
      reviewedAt: value('reviewed_at'),
      pros: points(value, slug, 'pro'),
      cons: points(value, slug, 'con'),
    })
  }
  if (rows.length === 0) throw new Error(`Editorial CSV has no rows for batch ${batch}`)
  return rows
}

function points(value: (column: string) => string, slug: string, kind: 'pro' | 'con'): EditorialSeedPoint[] {
  const pointsForKind: EditorialSeedPoint[] = []
  for (const position of [1, 2, 3]) {
    const text = value(`${kind}${position}`)
    const sourceUrl = value(`${kind}${position}_source`)
    if (!text && !sourceUrl) continue
    if (!text || !sourceUrl) throw new Error(`${slug} ${kind}${position} needs both text and a source URL`)
    pointsForKind.push({ text, sourceUrl })
  }
  return pointsForKind
}

function point(slug: string, key: string, raw: string): number {
  if (!/^\d(?:\.\d)?$/.test(raw)) throw new Error(`${slug} ${key} must be a tenth from 0 to 5`)
  return Number(raw)
}

/** RFC 4180 parser. Quoted fields may contain commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const input = text.replace(/^\uFEFF/, '')
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char ?? ''
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index += 1
      row.push(field)
      field = ''
      if (row.some((cell) => cell.length > 0)) rows.push(row)
      row = []
      continue
    }
    field += char ?? ''
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.some((cell) => cell.length > 0)) rows.push(row)
  }
  return rows
}

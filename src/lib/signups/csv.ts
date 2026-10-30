import type { Signup } from './types'

function csvCell(value: string): string {
  let cell = value
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`
  if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`
  return cell
}

export function toCsv(rows: readonly Signup[]): string {
  const lines = ['source,email,created_at']
  for (const row of rows) {
    lines.push([csvCell(row.source), csvCell(row.email), csvCell(row.createdAt)].join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

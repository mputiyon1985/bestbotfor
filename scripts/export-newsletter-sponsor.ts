import { getDb } from '../src/lib/db/client'
import { newsletterSponsorIssueExport } from '../src/lib/newsletter-sponsor'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Calendar date only. Past issues stay exportable so an operator can reprint one. */
function validIssueDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * Prints the Beehiiv HTML for paid $49 newsletter slots on one issue date.
 * The Sponsored label is added by newsletterSponsorIssueExport. This script
 * does not print the buyer email.
 */
async function main(): Promise<void> {
  const issueDate = process.argv[2] ?? ''
  if (!validIssueDate(issueDate)) {
    console.error('Pass the issue date as YYYY-MM-DD.')
    process.exit(1)
  }
  const html = await newsletterSponsorIssueExport(getDb(), issueDate)
  if (!html) {
    console.error('No paid $49 newsletter slot for that issue.')
    return
  }
  process.stdout.write(html.endsWith('\n') ? html : `${html}\n`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.name : 'error')
  process.exit(1)
})

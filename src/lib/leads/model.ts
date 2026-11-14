/**
 * Current lead status. Counts on the page are the number of rows in that
 * status. $ closed is not a status count: it is the sum of amount_closed_usd
 * for rows whose status is closed. A null amount counts as 0.
 *
 * Warm order, first to last: replied, affiliate_approved, contacted, closed,
 * declined, bounced. A replied lead is the warmest. A bounce is the coldest.
 */
export const LEAD_STATUSES = ['contacted', 'replied', 'affiliate_approved', 'declined', 'bounced', 'closed'] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  contacted: 'Contacted',
  replied: 'Replied',
  affiliate_approved: 'Affiliate approval',
  declined: 'Declined',
  bounced: 'Bounced',
  closed: 'Closed',
}

const WARM_ORDER: readonly LeadStatus[] = ['replied', 'affiliate_approved', 'contacted', 'closed', 'declined', 'bounced']

export type LeadRow = {
  id: number
  company: string
  contactEmail: string
  type: string
  firstContact: string | null
  lastTouch: string | null
  touches: number
  status: LeadStatus
  nextStep: string | null
  nextDate: string | null
  notes: string | null
  amountClosedUsd: number | null
  createdAt: number
  updatedAt: number
}

export type LeadSummary = {
  contacted: number
  replied: number
  affiliateApprovals: number
  declines: number
  bounces: number
  closedCount: number
  closedUsd: number
}

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value)
}

export function warmRank(status: string): number {
  const index = WARM_ORDER.indexOf(status as LeadStatus)
  return index === -1 ? WARM_ORDER.length : index
}

/**
 * contacted, replied, affiliate approvals, declines, and bounces are row
 * counts for that status. closedUsd is the sum of amount_closed_usd on
 * closed rows, in dollars, with null and non-finite amounts treated as 0.
 * Cents are summed as integers so 0.1 + 0.2 is 0.3.
 */
export function leadSummary(rows: readonly { status: string; amountClosedUsd: number | null }[]): LeadSummary {
  const summary: LeadSummary = {
    contacted: 0,
    replied: 0,
    affiliateApprovals: 0,
    declines: 0,
    bounces: 0,
    closedCount: 0,
    closedUsd: 0,
  }
  let cents = 0
  for (const row of rows) {
    if (row.status === 'contacted') summary.contacted += 1
    else if (row.status === 'replied') summary.replied += 1
    else if (row.status === 'affiliate_approved') summary.affiliateApprovals += 1
    else if (row.status === 'declined') summary.declines += 1
    else if (row.status === 'bounced') summary.bounces += 1
    else if (row.status === 'closed') {
      summary.closedCount += 1
      const amount = row.amountClosedUsd
      if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) cents += Math.round(amount * 100)
    }
  }
  summary.closedUsd = cents / 100
  return summary
}

export function formatClosedUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export const LEAD_SORTS = ['warm', 'company', 'email', 'type', 'status', 'first', 'last', 'touches', 'next', 'amount'] as const

export type LeadSort = (typeof LEAD_SORTS)[number]
export type LeadDir = 'asc' | 'desc'

export type LeadQuery = {
  sort: LeadSort
  dir: LeadDir
  status: LeadStatus | ''
  type: string
  q: string
}

export function emptyLeadQuery(): LeadQuery {
  return { sort: 'warm', dir: 'asc', status: '', type: '', q: '' }
}

function one(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' ? raw : ''
}

export function parseLeadQuery(params: Record<string, string | string[] | undefined>): LeadQuery {
  const sortRaw = one(params.sort)
  const dirRaw = one(params.dir)
  const statusRaw = one(params.status)
  const sort = (LEAD_SORTS as readonly string[]).includes(sortRaw) ? (sortRaw as LeadSort) : 'warm'
  const dir: LeadDir = dirRaw === 'desc' ? 'desc' : 'asc'
  const status = isLeadStatus(statusRaw) ? statusRaw : ''
  return {
    sort,
    dir,
    status,
    type: one(params.type).trim().slice(0, 64),
    q: one(params.q).trim().slice(0, 100),
  }
}

export function filterLeads(rows: readonly LeadRow[], query: LeadQuery): LeadRow[] {
  const needle = query.q.toLowerCase()
  return rows.filter((row) => {
    if (query.status && row.status !== query.status) return false
    if (query.type && row.type !== query.type) return false
    if (!needle) return true
    return row.company.toLowerCase().includes(needle) || row.contactEmail.toLowerCase().includes(needle)
  })
}

function compareText(left: string | null, right: string | null, dir: LeadDir): number {
  if (left === right) return 0
  if (!left) return 1
  if (!right) return -1
  const order = left < right ? -1 : 1
  return dir === 'asc' ? order : -order
}

function compareNumber(left: number | null, right: number | null, dir: LeadDir): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  if (left === right) return 0
  const order = left < right ? -1 : 1
  return dir === 'asc' ? order : -order
}

/** Warm is the default: replied first, then the rest of WARM_ORDER, then last touch. */
export function sortLeads(rows: readonly LeadRow[], query: LeadQuery): LeadRow[] {
  const copy = [...rows]
  copy.sort((left, right) => {
    let order = 0
    if (query.sort === 'warm') {
      order = warmRank(left.status) - warmRank(right.status)
      if (order === 0) order = compareText(left.lastTouch, right.lastTouch, 'desc')
      if (order === 0) order = compareText(left.company, right.company, 'asc')
    } else if (query.sort === 'company') order = compareText(left.company, right.company, query.dir)
    else if (query.sort === 'email') order = compareText(left.contactEmail, right.contactEmail, query.dir)
    else if (query.sort === 'type') order = compareText(left.type, right.type, query.dir)
    else if (query.sort === 'status') order = compareText(left.status, right.status, query.dir)
    else if (query.sort === 'first') order = compareText(left.firstContact, right.firstContact, query.dir)
    else if (query.sort === 'last') order = compareText(left.lastTouch, right.lastTouch, query.dir)
    else if (query.sort === 'touches') order = compareNumber(left.touches, right.touches, query.dir)
    else if (query.sort === 'next') order = compareText(left.nextDate, right.nextDate, query.dir)
    else if (query.sort === 'amount') order = compareNumber(left.amountClosedUsd, right.amountClosedUsd, query.dir)
    if (order !== 0) return order
    return left.id - right.id
  })
  return copy
}

export function toggleSort(query: LeadQuery, sort: LeadSort): LeadQuery {
  if (sort === 'warm') return { ...query, sort: 'warm', dir: 'asc' }
  if (query.sort === sort) return { ...query, dir: query.dir === 'asc' ? 'desc' : 'asc' }
  return { ...query, sort, dir: 'asc' }
}

export function leadsPageHref(query: LeadQuery): string {
  const params = new URLSearchParams()
  if (query.sort !== 'warm') params.set('sort', query.sort)
  if (query.dir !== 'asc') params.set('dir', query.dir)
  if (query.status) params.set('status', query.status)
  if (query.type) params.set('type', query.type)
  if (query.q) params.set('q', query.q)
  const text = params.toString()
  return text ? `/admin/leads?${text}` : '/admin/leads'
}

import { isLeadStatus, LEAD_STATUSES, type LeadStatus } from './model'

export const LEAD_ROW_LIMIT = 2000

export type LeadInput = {
  company: string
  contactEmail: string
  type: string
  status: LeadStatus
  firstContact: string | null
  lastTouch: string | null
  touches: number
  nextStep: string | null
  nextDate: string | null
  notes: string | null
  amountClosedUsd: number | null
}

export type LeadParse = { ok: true; rows: LeadInput[] } | { ok: false; errors: string[] }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code <= 31 || code === 127) return true
  }
  return false
}

function rowLabel(index: number): string {
  return `row ${index + 1}`
}

function optionalText(value: unknown, max: number): string | null | 'bad' | 'long' {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return 'bad'
  const text = value.trim()
  if (!text) return null
  if (text.length > max) return 'long'
  if (hasControlCharacter(text)) return 'bad'
  return text
}

function requiredText(value: unknown, max: number): string | 'bad' | 'long' | 'empty' {
  if (typeof value !== 'string') return 'bad'
  const text = value.trim()
  if (!text) return 'empty'
  if (text.length > max) return 'long'
  if (hasControlCharacter(text)) return 'bad'
  return text
}

function isoDate(value: unknown): string | null | 'bad' {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return 'bad'
  const text = value.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return 'bad'
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return 'bad'
  return text
}

function touches(value: unknown): number | 'bad' {
  if (value === null || value === undefined || value === '') return 0
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : null
  if (text === null || !/^\d+$/.test(text)) return 'bad'
  const parsed = Number(text)
  if (!Number.isInteger(parsed) || parsed > 1_000_000) return 'bad'
  return parsed
}

function money(value: unknown): number | null | 'bad' {
  if (value === null || value === undefined || value === '') return null
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : null
  if (text === null || !/^\d+(\.\d{1,2})?$/.test(text)) return 'bad'
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount > 1_000_000_000) return 'bad'
  return amount
}

function email(value: unknown): string | 'bad' {
  if (typeof value !== 'string') return 'bad'
  const text = value.trim().toLowerCase()
  if (text.length < 3 || text.length > 254) return 'bad'
  if (hasControlCharacter(text)) return 'bad'
  if (!EMAIL.test(text)) return 'bad'
  return text
}

function field(record: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(record, name)) return record[name]
  }
  return undefined
}

export function parseLeadRecord(value: unknown, index: number): { row?: LeadInput; errors: string[] } {
  const label = rowLabel(index)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { errors: [`${label}: expected an object`] }
  const record = value as Record<string, unknown>
  const errors: string[] = []

  const company = requiredText(field(record, 'company'), 200)
  if (company === 'long') errors.push(`${label}: company is too long`)
  else if (company === 'bad' || company === 'empty') errors.push(`${label}: company is required`)

  const contactEmail = email(field(record, 'contact_email', 'contactEmail'))
  if (contactEmail === 'bad') errors.push(`${label}: contact_email is invalid`)

  const type = requiredText(field(record, 'type'), 64)
  if (type === 'long') errors.push(`${label}: type is too long`)
  else if (type === 'bad' || type === 'empty') errors.push(`${label}: type is required`)

  const statusRaw = field(record, 'status')
  const statusText = typeof statusRaw === 'string' ? statusRaw.trim() : ''
  if (!isLeadStatus(statusText)) {
    errors.push(`${label}: status must be ${LEAD_STATUSES.join(', ')}`)
  }

  const firstContact = isoDate(field(record, 'first_contact', 'firstContact'))
  if (firstContact === 'bad') errors.push(`${label}: first_contact is invalid`)

  const lastTouch = isoDate(field(record, 'last_touch', 'lastTouch'))
  if (lastTouch === 'bad') errors.push(`${label}: last_touch is invalid`)

  const touchCount = touches(field(record, 'touches'))
  if (touchCount === 'bad') errors.push(`${label}: touches is invalid`)

  const nextStep = optionalText(field(record, 'next_step', 'nextStep'), 280)
  if (nextStep === 'bad') errors.push(`${label}: next_step is invalid`)
  if (nextStep === 'long') errors.push(`${label}: next_step is too long`)

  const nextDate = isoDate(field(record, 'next_date', 'nextDate'))
  if (nextDate === 'bad') errors.push(`${label}: next_date is invalid`)

  const notes = optionalText(field(record, 'notes'), 4000)
  if (notes === 'bad') errors.push(`${label}: notes are invalid`)
  if (notes === 'long') errors.push(`${label}: notes are too long`)

  const amount = money(field(record, 'amount_closed_usd', 'amountClosedUsd'))
  if (amount === 'bad') errors.push(`${label}: amount_closed_usd is invalid`)

  if (errors.length > 0) return { errors }
  return {
    errors: [],
    row: {
      company: company as string,
      contactEmail: contactEmail as string,
      type: type as string,
      status: statusText as LeadStatus,
      firstContact: firstContact as string | null,
      lastTouch: lastTouch as string | null,
      touches: touchCount as number,
      nextStep: nextStep as string | null,
      nextDate: nextDate as string | null,
      notes: notes as string | null,
      amountClosedUsd: amount as number | null,
    },
  }
}

function finish(rows: LeadInput[], errors: string[]): LeadParse {
  if (rows.length > LEAD_ROW_LIMIT) return { ok: false, errors: ['Too many rows.'] }
  const seen = new Set<string>()
  rows.forEach((row, index) => {
    if (seen.has(row.contactEmail)) errors.push(`${rowLabel(index)}: repeats an earlier contact_email`)
    seen.add(row.contactEmail)
  })
  if (errors.length > 0) return { ok: false, errors }
  if (rows.length === 0) return { ok: false, errors: ['No rows.'] }
  return { ok: true, rows }
}

export function parseLeadJson(value: unknown): LeadParse {
  const list = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { rows?: unknown }).rows) ? (value as { rows: unknown[] }).rows : null
  if (!list) return { ok: false, errors: ['Expected a JSON array or an object with rows.'] }
  const rows: LeadInput[] = []
  const errors: string[] = []
  list.forEach((entry, index) => {
    const parsed = parseLeadRecord(entry, index)
    errors.push(...parsed.errors)
    if (parsed.row) rows.push(parsed.row)
  })
  return finish(rows, errors)
}

export function parseCsvTable(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const source = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i] ?? ''
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i += 1
        } else quoted = false
      } else cell += char
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    if (char === '\r') continue
    cell += char
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export function parseLeadCsv(text: string): LeadParse {
  const table = parseCsvTable(text).filter((row) => row.some((cell) => cell.trim() !== ''))
  const header = table[0]
  if (!header) return { ok: false, errors: ['No rows.'] }
  const names = header.map((cell) => cell.trim())
  for (const required of ['company', 'contact_email', 'type', 'status']) {
    if (!names.includes(required)) return { ok: false, errors: [`Missing column ${required}.`] }
  }
  const rows: LeadInput[] = []
  const errors: string[] = []
  table.slice(1).forEach((cells, index) => {
    const record: Record<string, unknown> = {}
    names.forEach((name, cellIndex) => {
      record[name] = cells[cellIndex] ?? ''
    })
    const parsed = parseLeadRecord(record, index)
    errors.push(...parsed.errors)
    if (parsed.row) rows.push(parsed.row)
  })
  return finish(rows, errors)
}

export function parseLeadBody(contentType: string, text: string): LeadParse {
  if (text.length > 1_000_000) return { ok: false, errors: ['File is too large.'] }
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (type === 'text/csv' || type === 'application/csv') return parseLeadCsv(text)
  if (type === 'application/json' || type === 'text/json') {
    try {
      return parseLeadJson(JSON.parse(text) as unknown)
    } catch {
      return { ok: false, errors: ['The file is not valid JSON.'] }
    }
  }
  return { ok: false, errors: ['Send JSON or CSV.'] }
}

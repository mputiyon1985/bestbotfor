import type { Database } from '../db/client'
import type { LeadInput } from './parse'
import { isLeadStatus, type LeadRow } from './model'

const UPSERT = `
INSERT INTO bbf_leads (
  company, contact_email, type, first_contact, last_touch, touches, status,
  next_step, next_date, notes, amount_closed_usd, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(contact_email) DO UPDATE SET
  company = excluded.company,
  type = excluded.type,
  first_contact = excluded.first_contact,
  last_touch = excluded.last_touch,
  touches = excluded.touches,
  status = excluded.status,
  next_step = excluded.next_step,
  next_date = excluded.next_date,
  notes = excluded.notes,
  amount_closed_usd = excluded.amount_closed_usd,
  updated_at = excluded.updated_at
`

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

function number(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function listLeads(db: Database): Promise<LeadRow[]> {
  const result = await db.$client.execute(`
    SELECT id, company, contact_email, type, first_contact, last_touch, touches, status,
           next_step, next_date, notes, amount_closed_usd, created_at, updated_at
    FROM bbf_leads
  `)
  const rows: LeadRow[] = []
  for (const row of result.rows) {
    const status = text(row.status)
    if (!isLeadStatus(status)) continue
    rows.push({
      id: number(row.id),
      company: text(row.company),
      contactEmail: text(row.contact_email),
      type: text(row.type),
      firstContact: nullableText(row.first_contact),
      lastTouch: nullableText(row.last_touch),
      touches: number(row.touches),
      status,
      nextStep: nullableText(row.next_step),
      nextDate: nullableText(row.next_date),
      notes: nullableText(row.notes),
      amountClosedUsd: nullableNumber(row.amount_closed_usd),
      createdAt: number(row.created_at),
      updatedAt: number(row.updated_at),
    })
  }
  return rows
}

/** Insert or replace by contact_email. created_at stays on an existing row. */
export async function upsertLeads(db: Database, rows: readonly LeadInput[], now = Date.now()): Promise<number> {
  if (rows.length === 0) return 0
  const tx = await db.$client.transaction('write')
  try {
    for (const row of rows) {
      await tx.execute({
        sql: UPSERT,
        args: [
          row.company,
          row.contactEmail,
          row.type,
          row.firstContact,
          row.lastTouch,
          row.touches,
          row.status,
          row.nextStep,
          row.nextDate,
          row.notes,
          row.amountClosedUsd,
          now,
          now,
        ],
      })
    }
    await tx.commit()
    return rows.length
  } catch (error) {
    try {
      await tx.rollback()
    } catch {
      // The original write error is the one to surface.
    }
    throw error
  } finally {
    tx.close()
  }
}

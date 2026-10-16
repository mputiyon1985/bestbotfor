import 'server-only'

import { createHash } from 'node:crypto'
import type Stripe from 'stripe'
import { taskSeeds } from '@/data/catalog'
import {
  SPONSOR_INTEGRATION_IDENTIFIER,
  sponsorOffering,
  sponsorPriceId,
  type SponsorOfferingId,
} from './sponsor-offerings'
import { emailSchema } from './validation'

const COMPANY = /^[^\r\n<>]{2,120}$/
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TASKS = new Set(taskSeeds.map((task) => task.slug))

export type SponsorCheckoutInput = {
  offering: SponsorOfferingId
  email: string
  company: string
  taskSlug: string | null
  issueDate: string | null
  priceId: string
  requestId: string
}

export function parseSponsorCheckout(formData: FormData, env: Record<string, string | undefined> = process.env):
  | { ok: true; value: SponsorCheckoutInput }
  | { ok: false; message: string } {
  const offering = sponsorOffering(String(formData.get('offering') ?? ''))
  if (!offering) return { ok: false, message: 'Choose a sponsor slot.' }

  const email = emailSchema.safeParse(String(formData.get('email') ?? ''))
  if (!email.success) return { ok: false, message: 'Enter a valid work email.' }

  const company = String(formData.get('company') ?? '').trim()
  if (!COMPANY.test(company)) return { ok: false, message: 'Enter the company name.' }

  const requestId = String(formData.get('request_id') ?? '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return { ok: false, message: 'Refresh the page and try again.' }
  }

  const taskRaw = String(formData.get('task_slug') ?? '').trim()
  const issueRaw = String(formData.get('issue_date') ?? '').trim()
  let taskSlug: string | null = null
  let issueDate: string | null = null

  if (offering.target === 'task') {
    if (!TASKS.has(taskRaw)) return { ok: false, message: 'Choose a task page for this placement.' }
    taskSlug = taskRaw
  } else {
    const parsedDate = parseIssueDate(issueRaw)
    if (!parsedDate) return { ok: false, message: 'Choose the newsletter issue date.' }
    issueDate = parsedDate
  }

  const priceId = sponsorPriceId(offering.id, env)
  if (!priceId) return { ok: false, message: 'That offering is not available yet.' }

  return {
    ok: true,
    value: {
      offering: offering.id,
      email: email.data,
      company,
      taskSlug,
      issueDate,
      priceId,
      requestId,
    },
  }
}

function parseIssueDate(value: string): string | null {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  const today = new Date()
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const end = start + 540 * 24 * 60 * 60 * 1000
  if (date.getTime() < start || date.getTime() > end) return null
  return value
}

export function sponsorCheckoutParams(input: SponsorCheckoutInput & {
  successUrl: string
  cancelUrl: string
}): { params: Stripe.Checkout.SessionCreateParams; idempotencyKey: string } {
  const metadata: Record<string, string> = {
    kind: 'sponsorship',
    offering: input.offering,
    email: input.email,
    company: input.company,
    task_slug: input.taskSlug ?? '',
    issue_date: input.issueDate ?? '',
    price_id: input.priceId,
  }
  const fingerprintSource = [
    input.offering,
    input.email,
    input.company,
    input.taskSlug ?? '',
    input.issueDate ?? '',
    input.priceId,
    input.successUrl,
    input.cancelUrl,
  ].join('\n')
  const fingerprint = createHash('sha256').update(fingerprintSource).digest('hex').slice(0, 16)
  return {
    idempotencyKey: `sponsor-${fingerprint}-${input.requestId}`,
    params: {
      mode: 'payment',
      customer_email: input.email,
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata,
      payment_intent_data: { metadata },
      integration_identifier: SPONSOR_INTEGRATION_IDENTIFIER,
      // Advertising placements are not eligible for Managed Payments.
      // automatic_tax stays unset; this business remains the merchant of record.
      managed_payments: { enabled: false },
    },
  }
}

import { eq } from 'drizzle-orm'
import { createBeehiivSubscription, isBeehiivConfigured } from './beehiiv'
import type { Database } from './db'
import { subscribers } from './db/schema'
import { absoluteUrl } from './site'
import { allowRate } from './action-limit'
import { emailSchema, newsletterFieldsSchema } from './validation'

export type NewsletterResult = {
  status: 'success' | 'error'
  message: string
  tracked: boolean
}

const SUCCESS = "Thanks. You're on the list."

/**
 * Honeypot hits return the same success copy as a real signup and write nothing.
 * When Beehiiv env vars are unset, the email is stored locally only.
 */
export async function subscribeToNewsletter(input: {
  email: string
  honeypot: string
  db: Database
  rateKey: string
  fetchImpl?: typeof fetch
  now?: number
}): Promise<NewsletterResult> {
  const fields = newsletterFieldsSchema.safeParse({
    email: input.email,
    company_website: input.honeypot,
  })
  if (!fields.success) {
    return { status: 'error', message: 'Check the email address and try again.', tracked: false }
  }

  const allowed = await allowRate(input.db, input.rateKey, 5, 60 * 60 * 1000, {
    onError: 'closed',
    now: input.now,
  })
  if (!allowed) {
    return { status: 'error', message: 'Too many signup attempts. Try again in an hour.', tracked: false }
  }

  if (fields.data.company_website.trim() !== '') {
    return { status: 'success', message: SUCCESS, tracked: false }
  }

  const email = emailSchema.safeParse(fields.data.email)
  if (!email.success) {
    return { status: 'error', message: 'Enter a valid email address.', tracked: false }
  }

  const normalized = email.data.toLowerCase()
  const existing = await input.db.select().from(subscribers).where(eq(subscribers.email, normalized)).limit(1)
  if (existing[0]) {
    return { status: 'success', message: SUCCESS, tracked: false }
  }

  if (isBeehiivConfigured()) {
    const remote = await createBeehiivSubscription({
      email: normalized,
      referringSite: absoluteUrl('/newsletter'),
      fetchImpl: input.fetchImpl,
    })
    if (!remote.ok) {
      return {
        status: 'error',
        message: "We couldn't add you just now. Try again in a few minutes.",
        tracked: false,
      }
    }
    await input.db.insert(subscribers).values({
      email: normalized,
      createdAt: input.now ?? Date.now(),
      destination: 'beehiiv',
      beehiivId: remote.id,
    })
    return { status: 'success', message: SUCCESS, tracked: true }
  }

  await input.db.insert(subscribers).values({
    email: normalized,
    createdAt: input.now ?? Date.now(),
    destination: 'local',
    beehiivId: null,
  })
  return { status: 'success', message: SUCCESS, tracked: true }
}

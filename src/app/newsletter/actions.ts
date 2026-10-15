'use server'

import { headers } from 'next/headers'
import { getDb } from '@/lib/db'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { subscribeToNewsletter, type NewsletterResult } from '@/lib/newsletter'

export type NewsletterState = NewsletterResult | { status: 'idle'; message: string; tracked: boolean }

export async function subscribeAction(_previous: NewsletterState, formData: FormData): Promise<NewsletterState> {
  const headerStore = await headers()
  try {
    return await subscribeToNewsletter({
      email: String(formData.get('email') ?? ''),
      honeypot: String(formData.get('company_website') ?? ''),
      db: getDb(),
      rateKey: rateLimitKey(clientIp(headerStore), 'newsletter'),
    })
  } catch (error) {
    console.error('newsletter failed', error instanceof Error ? error.name : 'error')
    return { status: 'error', message: 'Something went wrong. Try again.', tracked: false }
  }
}

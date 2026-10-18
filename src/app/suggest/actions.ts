'use server'

import { headers } from 'next/headers'
import { getDb } from '@/lib/db'
import { clientIp, rateLimitKey } from '@/lib/ip'
import { submitSuggestion, type SuggestionResult } from '@/lib/suggestions'

export type SuggestionState = SuggestionResult | { status: 'idle'; message: string }

export async function suggestAction(_previous: SuggestionState, formData: FormData): Promise<SuggestionState> {
  const headerStore = await headers()
  try {
    return await submitSuggestion({
      kind: String(formData.get('kind') ?? ''),
      message: String(formData.get('message') ?? ''),
      email: String(formData.get('email') ?? ''),
      honeypot: String(formData.get('suggestion_website') ?? ''),
      db: getDb(),
      rateKey: rateLimitKey(clientIp(headerStore), 'suggestion'),
    })
  } catch (error) {
    console.error('suggestion failed', error instanceof Error ? error.name : 'error')
    return { status: 'error', message: 'Something went wrong. Try again.' }
  }
}

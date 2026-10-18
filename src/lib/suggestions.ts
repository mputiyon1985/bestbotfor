import { suggestions } from '@/lib/db/schema'
import type { Database } from '@/lib/db/client'
import { notifySuggestion, type SuggestionNotice } from '@/lib/suggestion-mail'
import { allowSuggestionRate } from '@/lib/suggestion-rate'
import { emailSchema } from '@/lib/validation'

export const SUGGESTION_KINDS = ['like', 'add', 'remove'] as const
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number]

export const SUGGESTION_SUCCESS = 'Thanks. We read every note.'

export type SuggestionResult =
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

const KIND_ERROR = 'Choose like, add, or remove.'
const MESSAGE_ERROR = 'Enter a message.'
const LENGTH_ERROR = 'Keep the message under 2000 characters.'
const EMAIL_ERROR = 'Enter a valid email address.'
const LIMIT_ERROR = 'Too many suggestions. Try again in an hour.'

function isKind(value: string): value is SuggestionKind {
  return (SUGGESTION_KINDS as readonly string[]).includes(value)
}

/**
 * Stores one private suggestion. A filled honeypot looks successful and writes
 * nothing. The rate key stays in memory. The row has no address and no hash.
 */
export async function submitSuggestion(input: {
  kind: string
  message: string
  email: string
  honeypot: string
  db: Database
  rateKey: string
  now?: number
  notify?: (row: { id: number; kind: SuggestionKind }) => SuggestionNotice
}): Promise<SuggestionResult> {
  if (input.honeypot.trim()) return { status: 'success', message: SUGGESTION_SUCCESS }

  const now = input.now ?? Date.now()
  if (!allowSuggestionRate(input.rateKey, now)) return { status: 'error', message: LIMIT_ERROR }

  const kind = input.kind.trim()
  if (!isKind(kind)) return { status: 'error', message: KIND_ERROR }

  const message = input.message.trim()
  if (!message) return { status: 'error', message: MESSAGE_ERROR }
  if (message.length > 2000) return { status: 'error', message: LENGTH_ERROR }

  const emailText = input.email.trim()
  let email: string | null = null
  if (emailText) {
    const parsed = emailSchema.safeParse(emailText)
    if (!parsed.success) return { status: 'error', message: EMAIL_ERROR }
    email = parsed.data
  }

  const notify = input.notify ?? notifySuggestion
  const inserted = await input.db
    .insert(suggestions)
    .values({ kind, message, email, createdAt: now })
    .returning({ id: suggestions.id })
  const id = Number(inserted[0]?.id)
  notify({ id, kind })
  return { status: 'success', message: SUGGESTION_SUCCESS }
}

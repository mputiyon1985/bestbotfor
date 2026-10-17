'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useReverification } from '@clerk/nextjs'
import { markSponsorRefundedAction, reviewSponsorCardAction } from '@/app/admin/sponsors/actions'
import type { PendingSponsorCard, RefundPendingSponsorCard } from '@/lib/sponsor-card'
import { SPONSOR_INVISIBLE_WARNING, SPONSOR_MARK_REFUNDED_NOTE, SPONSOR_REFUND_NOTE } from '@/lib/sponsor-offerings'

export function SponsorCardQueue({ cards }: { cards: PendingSponsorCard[] }) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const review = useReverification(async (formData: FormData) => reviewSponsorCardAction(formData))

  async function submit(formData: FormData) {
    const result = await review(formData)
    if (result && typeof result === 'object' && 'ok' in result && result.ok) {
      setMessage('Saved.')
      router.refresh()
      return
    }
    if (result && typeof result === 'object' && 'message' in result && typeof result.message === 'string') {
      setMessage(result.message)
    }
  }

  return (
    <div className="space-y-6">
      {message ? <p role="status">{message}</p> : null}
      <ul className="space-y-6">
        {cards.map((card) => (
          <li key={card.id} className="rounded-2xl border border-line p-4">
            <div className="flex items-start gap-3">
              <img src={card.logoSrc} alt="" width={40} height={40} className="h-10 w-10 rounded-lg" />
              <div>
                <p className="font-semibold">{card.name}</p>
                <p className="text-sm">{card.description}</p>
                <p className="text-sm break-all">{card.url}</p>
                <p className="mt-1 text-sm text-muted">
                  {card.company ?? 'No company'} · {card.taskSlug ?? 'No task'} · {card.offering} · Version {card.version}
                </p>
                {card.hadInvisible ? <p className="mt-1 text-sm text-danger">{SPONSOR_INVISIBLE_WARNING}</p> : null}
              </div>
            </div>
            <form action={submit} className="mt-4">
              <input type="hidden" name="creative_id" value={card.id} />
              <input type="hidden" name="decision" value="approved" />
              <input type="hidden" name="version" value={card.version} />
              <input type="hidden" name="updated_at" value={card.updatedAt} />
              <input type="hidden" name="content_hash" value={card.contentHash} />
              <button type="submit" className="min-h-11 rounded-full bg-indigo px-4 font-medium text-white">
                Approve
              </button>
            </form>
            <form action={submit} className="mt-3 space-y-2">
              <input type="hidden" name="creative_id" value={card.id} />
              <input type="hidden" name="decision" value="rejected" />
              <input type="hidden" name="version" value={card.version} />
              <input type="hidden" name="updated_at" value={card.updatedAt} />
              <input type="hidden" name="content_hash" value={card.contentHash} />
              <label htmlFor={`reject-${card.id}`} className="text-sm font-semibold">
                Rejection reason
              </label>
              <textarea
                id={`reject-${card.id}`}
                name="reason"
                required
                minLength={3}
                maxLength={500}
                className="block min-h-24 w-full rounded-xl border border-line px-3 py-2"
              />
              <p className="text-sm text-muted">{SPONSOR_REFUND_NOTE}</p>
              <button type="submit" className="min-h-11 underline">
                Reject
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SponsorRefundQueue({ cards }: { cards: RefundPendingSponsorCard[] }) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const mark = useReverification(async (formData: FormData) => markSponsorRefundedAction(formData))

  async function submit(formData: FormData) {
    const result = await mark(formData)
    if (result && typeof result === 'object' && 'ok' in result && result.ok) {
      setMessage('Marked refunded.')
      router.refresh()
      return
    }
    if (result && typeof result === 'object' && 'message' in result && typeof result.message === 'string') {
      setMessage(result.message)
    }
  }

  return (
    <div className="space-y-6">
      {message ? <p role="status">{message}</p> : null}
      <ul className="space-y-6">
        {cards.map((card) => (
          <li key={card.id} className="rounded-2xl border border-line p-4">
            <p className="font-semibold">{card.name}</p>
            <p className="text-sm text-muted">
              refund_pending · {card.company ?? 'No company'} · {card.taskSlug ?? 'No task'} · {card.offering}
            </p>
            <form action={submit} className="mt-3 space-y-2">
              <input type="hidden" name="creative_id" value={card.id} />
              <p className="text-sm text-muted">{SPONSOR_MARK_REFUNDED_NOTE}</p>
              <label htmlFor={`refund-${card.id}`} className="text-sm font-semibold">
                Note
              </label>
              <textarea
                id={`refund-${card.id}`}
                name="reason"
                maxLength={500}
                className="block min-h-20 w-full rounded-xl border border-line px-3 py-2"
              />
              <button type="submit" className="min-h-11 underline">
                Mark refunded
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}

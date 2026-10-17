'use client'

import { useActionState } from 'react'
import { submitSponsorCardAction, type SponsorFormState } from '@/app/sponsor/actions'
import { SPONSOR_REVIEW_NOTICE } from '@/lib/sponsor-offerings'

const initial: SponsorFormState = { status: 'idle', message: '' }

/** Shown after Checkout when the return URL includes a session id. */
export function SponsorCardFollowup({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState(submitSponsorCardAction, initial)
  return (
    <form action={action} encType="multipart/form-data" className="space-y-4">
      <h2 className="font-semibold text-2xl">Tool card</h2>
      <p className="text-sm text-muted">{SPONSOR_REVIEW_NOTICE}</p>
      <input type="hidden" name="session_id" value={sessionId} />
      <div>
        <label htmlFor="followup-tool-name" className="font-semibold">
          Tool name
        </label>
        <input id="followup-tool-name" name="tool_name" type="text" required maxLength={60} className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3" />
      </div>
      <div>
        <label htmlFor="followup-tool-description" className="font-semibold">
          One-line description
        </label>
        <input
          id="followup-tool-description"
          name="tool_description"
          type="text"
          required
          minLength={12}
          maxLength={140}
          className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3"
        />
      </div>
      <div>
        <label htmlFor="followup-tool-url" className="font-semibold">
          Tool URL
        </label>
        <input id="followup-tool-url" name="tool_url" type="url" required maxLength={300} className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3" />
      </div>
      <div>
        <label htmlFor="followup-logo" className="font-semibold">
          Logo
        </label>
        <input id="followup-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required className="mt-2 block w-full text-sm" />
      </div>
      <button type="submit" disabled={pending} className="min-h-12 rounded-full bg-indigo px-5 font-medium text-white disabled:opacity-60">
        {pending ? 'Submitting…' : 'Submit tool card'}
      </button>
      <p role={state.status === 'error' ? 'alert' : 'status'} className={state.status === 'error' ? 'text-danger' : 'text-muted'}>
        {state.message}
      </p>
    </form>
  )
}

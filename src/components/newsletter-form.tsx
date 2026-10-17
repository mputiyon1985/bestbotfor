'use client'

import { useActionState, useEffect, useRef } from 'react'
import { track } from '@/lib/analytics'
import { subscribeAction, type NewsletterState } from '@/app/newsletter/actions'

const initial: NewsletterState = { status: 'idle', message: '', tracked: false }

export function NewsletterForm({ idSuffix = '' }: { idSuffix?: string }) {
  const [state, action, pending] = useActionState(subscribeAction, initial)
  const tracked = useRef(false)
  const emailId = idSuffix ? `email-${idSuffix}` : 'email'
  const statusId = idSuffix ? `newsletter-status-${idSuffix}` : 'newsletter-status'
  const companyId = idSuffix ? `company-website-${idSuffix}` : 'company_website'

  useEffect(() => {
    if (state.status === 'success' && state.tracked && !tracked.current) {
      tracked.current = true
      track('newsletter_signup')
    }
  }, [state])

  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <label htmlFor={emailId} className="font-semibold">
          Email address
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          aria-invalid={state.status === 'error'}
          aria-describedby={statusId}
          className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3"
        />
      </div>
      <div className="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor={companyId}>Company website</label>
        <input id={companyId} name="company_website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <button type="submit" disabled={pending} className="min-h-12 rounded-full bg-indigo px-5 font-medium text-white">
        {pending ? 'Sending…' : 'Get the daily digest'}
      </button>
      <p id={statusId} role="status" className={state.status === 'error' ? 'text-danger' : 'text-muted'}>
        {state.message}
      </p>
    </form>
  )
}

'use client'

import { useActionState, useEffect, useRef } from 'react'
import { track } from '@/lib/analytics'
import { subscribeAction, type NewsletterState } from '@/app/newsletter/actions'

const initial: NewsletterState = { status: 'idle', message: '', tracked: false }

export function NewsletterForm() {
  const [state, action, pending] = useActionState(subscribeAction, initial)
  const tracked = useRef(false)

  useEffect(() => {
    if (state.status === 'success' && state.tracked && !tracked.current) {
      tracked.current = true
      track('newsletter_signup')
    }
  }, [state])

  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="font-semibold">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          aria-invalid={state.status === 'error'}
          aria-describedby="newsletter-status"
          className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3"
        />
      </div>
      <div className="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="company_website">Company website</label>
        <input id="company_website" name="company_website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <button type="submit" disabled={pending} className="min-h-12 rounded-full bg-forest px-5 font-semibold text-white">
        {pending ? 'Sending…' : 'Sign up'}
      </button>
      <p id="newsletter-status" role="status" className={state.status === 'error' ? 'text-danger' : 'text-muted'}>
        {state.message}
      </p>
    </form>
  )
}

'use client'

import { useActionState, useEffect, useState } from 'react'
import { sponsorCheckoutAction, type SponsorFormState } from '@/app/sponsor/actions'
import { SPONSOR_COMPANY_PUBLISHED, SPONSOR_ONE_TIME_NOTICE, SPONSOR_REVIEW_NOTICE } from '@/lib/sponsor-offerings'

export type SponsorFormOffering = {
  id: string
  title: string
  summary: string
  priceLabel: string
  target: 'task' | 'issue_date'
  available: boolean
}

export type SponsorFormTask = { slug: string; name: string }

const initial: SponsorFormState = { status: 'idle', message: '' }

export function SponsorForm({ offerings, tasks }: { offerings: SponsorFormOffering[]; tasks: SponsorFormTask[] }) {
  const [state, action, pending] = useActionState(sponsorCheckoutAction, initial)
  const firstAvailable = offerings.find((offering) => offering.available)?.id ?? offerings[0]?.id ?? ''
  const [offeringId, setOfferingId] = useState(firstAvailable)
  const [requestId, setRequestId] = useState('')
  useEffect(() => {
    setRequestId(crypto.randomUUID())
  }, [])
  const selected = offerings.find((offering) => offering.id === offeringId) ?? offerings[0]
  const checkoutReady = offerings.some((offering) => offering.available)

  return (
    <form action={action} encType="multipart/form-data" className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="font-semibold">Offering</legend>
        {offerings.map((offering) => (
          <label key={offering.id} className="flex min-h-12 items-start gap-3 rounded-2xl border border-line bg-card px-4 py-3">
            <input
              type="radio"
              name="offering"
              value={offering.id}
              className="mt-1"
              checked={offering.id === offeringId}
              disabled={!offering.available}
              onChange={() => setOfferingId(offering.id)}
              required
            />
            <span>
              <span className="font-semibold">
                {offering.title} · {offering.priceLabel}
              </span>
              <span className="mt-1 block text-sm text-muted">{offering.summary}</span>
              <span className="mt-1 block text-sm">{SPONSOR_ONE_TIME_NOTICE}</span>
              {offering.available ? null : (
                <span className="mt-1 block text-sm">Checkout for this slot is not configured yet.</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>

      <div>
        <label htmlFor="sponsor-email" className="font-semibold">
          Work email
        </label>
        <input
          id="sponsor-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          aria-invalid={state.status === 'error'}
          aria-describedby="sponsor-status"
          className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3"
        />
      </div>

      <div>
        <label htmlFor="sponsor-company" className="font-semibold">
          Company
        </label>
        <input
          id="sponsor-company"
          name="company"
          type="text"
          autoComplete="organization"
          required
          maxLength={120}
          aria-describedby="sponsor-company-published"
          className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3"
        />
        <p id="sponsor-company-published" className="mt-1 text-sm text-muted">
          {SPONSOR_COMPANY_PUBLISHED}
        </p>
      </div>

      <div>
        <label htmlFor="sponsor-task" className="font-semibold">
          Task page
        </label>
        <select
          id="sponsor-task"
          name="task_slug"
          required={selected?.target === 'task'}
          className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3"
          defaultValue=""
        >
          <option value="">Choose a /best page</option>
          {tasks.map((task) => (
            <option key={task.slug} value={task.slug}>
              {task.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-muted">Required for a featured placement.</p>
      </div>

      <div>
        <label htmlFor="sponsor-issue" className="font-semibold">
          Newsletter issue date
        </label>
        <input
          id="sponsor-issue"
          name="issue_date"
          type="date"
          required={selected?.target === 'issue_date'}
          className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3"
        />
        <p className="mt-1 text-sm text-muted">Required for a newsletter slot.</p>
      </div>

      {selected?.target === 'task' ? (
        <fieldset className="space-y-4">
          <legend className="font-semibold">Tool card</legend>
          <div>
            <label htmlFor="sponsor-tool-name" className="font-semibold">
              Tool name
            </label>
            <input
              id="sponsor-tool-name"
              name="tool_name"
              type="text"
              required
              maxLength={60}
              className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3"
            />
          </div>
          <div>
            <label htmlFor="sponsor-tool-description" className="font-semibold">
              One-line description
            </label>
            <input
              id="sponsor-tool-description"
              name="tool_description"
              type="text"
              required
              minLength={12}
              maxLength={140}
              className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3"
            />
          </div>
          <div>
            <label htmlFor="sponsor-tool-url" className="font-semibold">
              Tool URL
            </label>
            <input
              id="sponsor-tool-url"
              name="tool_url"
              type="url"
              required
              maxLength={300}
              placeholder="https://"
              className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3"
            />
          </div>
          <div>
            <label htmlFor="sponsor-logo" className="font-semibold">
              Logo
            </label>
            <input
              id="sponsor-logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required
              className="mt-2 block w-full text-sm"
            />
            <p className="mt-1 text-sm text-muted">PNG, JPEG, or WebP. 200 KB maximum.</p>
          </div>
        </fieldset>
      ) : null}

      <p className="text-sm text-muted">{SPONSOR_REVIEW_NOTICE}</p>

      <input type="hidden" name="request_id" value={requestId} />

      <button
        type="submit"
        disabled={pending || !checkoutReady || requestId.length === 0}
        className="min-h-12 rounded-full bg-indigo px-5 font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Starting checkout…' : 'Continue to checkout'}
      </button>
      <p id="sponsor-status" role={state.status === 'error' ? 'alert' : 'status'} className={state.status === 'error' ? 'text-danger' : 'text-muted'}>
        {state.message}
      </p>
    </form>
  )
}

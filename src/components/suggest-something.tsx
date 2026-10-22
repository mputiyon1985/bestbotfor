'use client'

import { useActionState, useEffect, useRef } from 'react'
import { suggestAction, type SuggestionState } from '@/app/suggest/actions'
import { LightbulbIcon } from '@/components/lightbulb-icon'

export const OPEN_SUGGESTION_EVENT = 'bbf-open-suggestion'

export function SuggestSomethingLink({ className }: { className?: string }) {
  return (
    <a
      href="#suggest-something"
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_SUGGESTION_EVENT))}
    >
      <LightbulbIcon />
      Suggest something
    </a>
  )
}

export function SuggestionDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [state, action, pending] = useActionState(suggestAction, { status: 'idle', message: '' } satisfies SuggestionState)
  const kindId = 'suggestion-kind'
  const messageId = 'suggestion-message'
  const emailId = 'suggestion-email'
  const statusId = 'suggestion-status'
  const errorId = 'suggestion-error'
  const errorField = state.status === 'error' && 'field' in state ? state.field : undefined
  const invalid = (field: 'kind' | 'message' | 'email') => (errorField === field ? true : undefined)
  const describedBy = (field: 'kind' | 'message' | 'email') => (errorField === field ? errorId : undefined)
  const honeyId = 'suggestion-company-website'

  useEffect(() => {
    const open = () => {
      const dialog = dialogRef.current
      if (!dialog) return
      if (!dialog.open) dialog.showModal()
      dialog.querySelector<HTMLElement>(`#${kindId}`)?.focus()
    }
    if (window.location.hash === '#suggest-something') open()
    window.addEventListener(OPEN_SUGGESTION_EVENT, open)
    return () => window.removeEventListener(OPEN_SUGGESTION_EVENT, open)
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="suggest-title"
      className="w-[min(100%,32rem)] rounded-xl border border-line bg-card p-6 text-ink"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id="suggest-title" className="flex items-center gap-2 font-semibold text-xl">
          <LightbulbIcon />
          Suggest something
        </h2>
        <button
          type="button"
          className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
          onClick={() => dialogRef.current?.close()}
        >
          Close
        </button>
      </div>
      <form action={action} className="mt-4 space-y-4" noValidate>
        <div>
          <label htmlFor={kindId} className="font-semibold">
            Type
          </label>
          <select id={kindId} name="kind" required aria-invalid={invalid('kind')} aria-describedby={describedBy('kind')} className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3">
            <option value="like">Like something</option>
            <option value="add">Add something</option>
            <option value="remove">Remove something</option>
          </select>
        </div>
        <div>
          <label htmlFor={messageId} className="font-semibold">
            Message
          </label>
          <textarea
            id={messageId}
            name="message"
            required
            maxLength={2000}
            rows={5}
            aria-invalid={invalid('message')}
            aria-describedby={describedBy('message')}
            className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor={emailId} className="font-semibold">
            Email <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            aria-invalid={invalid('email')}
            aria-describedby={describedBy('email')}
            className="mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3"
          />
        </div>
        <div className="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
          <label htmlFor={honeyId}>Website</label>
          <input id={honeyId} name="suggestion_website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        <button type="submit" disabled={pending} className="min-h-12 rounded-full bg-indigo px-5 font-medium text-white">
          {pending ? 'Sending…' : 'Send suggestion'}
        </button>
        <p id={errorId} role="alert" className="text-danger">
          {state.status === 'error' ? state.message : ''}
        </p>
        <p id={statusId} role="status" className="text-muted">
          {state.status === 'success' ? state.message : ''}
        </p>
      </form>
    </dialog>
  )
}

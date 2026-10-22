'use client'

import { useActionState, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { track } from '@/lib/analytics'
import { CONSENT_EVENT } from '@/lib/consent'
import { FirstTouchField } from '@/components/first-touch-field'
import { NEWSLETTER_CTA_COPY } from '@/data/newsletter-cta-copy'
import {
  dismissNewsletterCta,
  newsletterCtaThanks,
  isNewsletterCtaDismissed,
  scrolledPastThreshold,
} from '@/lib/newsletter-cta'
import type { NewsletterSource } from '@/lib/newsletter-source'
import { subscribeAction, type NewsletterState } from '@/app/newsletter/actions'

const initial: NewsletterState = { status: 'idle', message: '', tracked: false }
const MOBILE_QUERY = '(max-width: 767px)'

type Done = { message: string }

/**
 * Newsletter CTA for /compare/*, /alternatives/*, /best/*, and /guides/*.
 * Render only when newsletterCtaEnabled() is true (the page decides).
 * One inline box where it is placed, plus a slim sticky bottom bar after ~40% scroll.
 * Both post through the existing newsletter action (honeypot, rate limit, Beehiiv sync).
 */
export function NewsletterCta({ path, source }: { path: string; source: NewsletterSource }) {
  const [done, setDone] = useState<Done | null>(null)
  const inlineRef = useRef<HTMLElement>(null)
  const [inlineVisible, setInlineVisible] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [dismissed, setDismissed] = useState(true)
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    setDismissed(isNewsletterCtaDismissed())
    const media = window.matchMedia?.(MOBILE_QUERY)
    const onMedia = () => setMobile(Boolean(media?.matches))
    onMedia()
    media?.addEventListener?.('change', onMedia)
    const onScroll = () => {
      const doc = document.documentElement
      setScrolled(scrolledPastThreshold(window.scrollY, window.innerHeight, doc.scrollHeight))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    let observer: IntersectionObserver | null = null
    if (inlineRef.current && typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) setInlineVisible(entry.isIntersecting)
      })
      observer.observe(inlineRef.current)
    }
    return () => {
      media?.removeEventListener?.('change', onMedia)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      observer?.disconnect()
    }
  }, [])

  const onSuccess = useCallback((message: string) => setDone({ message }), [])
  const dismiss = () => {
    dismissNewsletterCta()
    setDismissed(true)
  }
  const showBar = !dismissed && !done && scrolled && !(mobile && inlineVisible)
  const barRef = useRef<HTMLDivElement>(null)
  const [barHeight, setBarHeight] = useState(0)
  useLayoutEffect(() => {
    const el = barRef.current
    if (!showBar || !el) return
    const measure = () => setBarHeight(el.offsetHeight)
    measure()
    if (typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [showBar])

  return (
    <>
      <section
        ref={inlineRef}
        data-newsletter-cta="inline"
        aria-labelledby="newsletter-cta-heading"
        className="rounded-3xl border border-line bg-card px-4 py-6 md:px-6"
      >
        <h2 id="newsletter-cta-heading" className="font-semibold text-2xl">
          {NEWSLETTER_CTA_COPY.headline}
        </h2>
        <p className="mt-2 max-w-xl text-muted">{NEWSLETTER_CTA_COPY.sub}</p>
        <div className="mt-4 max-w-xl">
          {done ? (
            <p role="status" data-newsletter-cta-thanks>{newsletterCtaThanks(done.message)}</p>
          ) : (
            <>
              <CtaForm variant="inline" path={path} source={source} onSuccess={onSuccess} />
              <p className="mt-2 text-sm text-muted" data-newsletter-cta-fineprint>{NEWSLETTER_CTA_COPY.finePrint}</p>
            </>
          )}
        </div>
      </section>
      {/* Portaled to the end of <body>: last in tab order, after the footer. The spacer keeps the footer clear of the bar. */}
      {showBar && typeof document !== 'undefined'
        ? createPortal(
            <>
              <div aria-hidden="true" data-newsletter-cta-spacer style={{ height: barHeight }} />
        <div
          ref={barRef}
          data-newsletter-cta="bar"
          role="region"
          aria-label="Newsletter signup"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card px-4 py-2 shadow-lg"
        >
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <p className="hidden min-w-0 flex-1 font-semibold md:block">{NEWSLETTER_CTA_COPY.stickyBar}</p>
            <div className="min-w-0 flex-1">
              <CtaForm variant="bar" path={path} source={source} onSuccess={onSuccess} />
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label={NEWSLETTER_CTA_COPY.dismissLabel}
              data-newsletter-cta-dismiss
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo"
            >
              ×
            </button>
          </div>
        </div>
            </>,
            document.body,
          )
        : null}
    </>
  )
}

function CtaForm({
  variant,
  path,
  source,
  onSuccess,
}: {
  variant: 'inline' | 'bar'
  path: string
  source: NewsletterSource
  onSuccess: (message: string) => void
}) {
  const [state, action, pending] = useActionState(subscribeAction, initial)
  const tracked = useRef(false)
  const emailId = `newsletter-cta-email-${variant}`
  const statusId = `newsletter-cta-status-${variant}`
  const honeyId = `newsletter-cta-company-website-${variant}`

  useEffect(() => {
    if (state.status === 'success') onSuccess(state.message)
    if (state.status !== 'success' || !state.tracked) return
    const send = () => {
      if (tracked.current) return
      if (track('newsletter_signup', { source: path })) tracked.current = true
    }
    send()
    window.addEventListener(CONSENT_EVENT, send)
    return () => window.removeEventListener(CONSENT_EVENT, send)
  }, [state, path, onSuccess])

  return (
    <form action={action} noValidate data-newsletter-cta-form={variant} className={variant === 'bar' ? 'flex items-start gap-2' : 'space-y-3'}>
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="cta_path" value={path} />
      <FirstTouchField />
      <label htmlFor={emailId} className={variant === 'bar' ? 'sr-only' : 'font-semibold'}>
        {NEWSLETTER_CTA_COPY.emailLabel}
      </label>
      <input
        id={emailId}
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        placeholder={variant === 'bar' ? 'you@example.com' : undefined}
        aria-invalid={state.status === 'error'}
        aria-describedby={statusId}
        className={`min-h-11 w-full rounded-xl border border-line bg-card px-3 ${variant === 'bar' ? 'flex-1' : 'mt-1 block'}`}
      />
      <div className="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor={honeyId}>Company website</label>
        <input id={honeyId} name="company_website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <button type="submit" disabled={pending} className="min-h-11 shrink-0 rounded-full bg-indigo px-5 font-medium text-white">
        {pending ? 'Sending…' : NEWSLETTER_CTA_COPY.button}
      </button>
      <p id={statusId} role="status" className={`text-sm ${state.status === 'error' ? 'text-danger' : 'text-muted'} ${variant === 'bar' && state.status !== 'error' ? 'sr-only' : ''}`}>
        {state.status === 'error' ? state.message : ''}
      </p>
    </form>
  )
}

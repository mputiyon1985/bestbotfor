import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { NewsletterForm } from '@/components/newsletter-form'
import { StripeTestModeNotice } from '@/components/stripe-test-mode-notice'
import { checkoutNoticeMessage } from '@/lib/billing-notice'
import { formatStripeAmount } from '@/lib/format'
import { pageMetadata } from '@/lib/metadata'
import { currentClerkUserId } from '@/lib/members'
import { getPublicPrice } from '@/lib/pricing'
import { MEMBERS_COMING_SOON_COPY, pricingView } from '@/lib/pricing-view'
import { checkoutAction } from './actions'

export const metadata: Metadata = pageMetadata({
  title: 'Pricing',
  description: 'BestBotFor membership pricing is read from Stripe. We do not publish a price we did not receive.',
  path: '/pricing',
})

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const price = await getPublicPrice()
  const userId = await currentClerkUserId()
  const params = await searchParams
  const notice = checkoutNoticeMessage(typeof params.notice === 'string' ? params.notice : '')
  const view = pricingView(price)

  if (view === 'coming-soon') {
    return (
      <article className="max-w-2xl space-y-6">
        <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Pricing', path: '/pricing' }]} />
        <h1 className="font-bold text-5xl">Membership</h1>
        <StripeTestModeNotice />
        {notice ? <p role="alert">{notice}</p> : null}
        <p className="text-xl">{MEMBERS_COMING_SOON_COPY}</p>
        <NewsletterForm source="newsletter" idSuffix="pricing" />
      </article>
    )
  }

  return (
    <article className="max-w-2xl space-y-6">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Pricing', path: '/pricing' }]} />
      <h1 className="font-bold text-5xl">Membership</h1>
      <StripeTestModeNotice />
      {notice ? <p role="alert">{notice}</p> : null}
      <p>A free account can save 10 picks. Membership saves without a cap and opens the longer comparison notes. The public guides stay free.</p>
      {price.available ? (
        <p className="font-bold text-4xl">{formatStripeAmount(price.unitAmount, price.currency, price.interval)}</p>
      ) : (
        <p>Pricing is temporarily unavailable. We will not guess a number.</p>
      )}
      <ul className="list-disc space-y-2 pl-5">
        <li>Save picks without the free-account cap.</li>
        <li>Read the members’ notes on comparison pages.</li>
        <li>Manage the subscription in Stripe’s billing portal.</li>
      </ul>
      {price.available && userId ? (
        <form action={checkoutAction}>
          <button type="submit" className="min-h-12 rounded-full bg-indigo px-5 font-medium text-white">
            Continue to checkout
          </button>
        </form>
      ) : null}
      {price.available && !userId ? (
        <Link href="/sign-in" className="inline-flex min-h-12 items-center rounded-full bg-indigo px-5 font-medium text-white">
          Sign in to subscribe
        </Link>
      ) : null}
    </article>
  )
}

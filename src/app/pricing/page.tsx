import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { formatStripeAmount } from '@/lib/format'
import { pageMetadata } from '@/lib/metadata'
import { currentClerkUserId } from '@/lib/members'
import { getPublicPrice } from '@/lib/pricing'
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
  const notice = typeof params.notice === 'string' ? params.notice : ''

  return (
    <article className="max-w-2xl space-y-6">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Pricing', path: '/pricing' }]} />
      <h1 className="font-bold text-5xl">Membership</h1>
      <p role="note" className="rounded-2xl border border-line bg-mist px-4 py-3 text-sm">
        Checkout uses Stripe test mode. No real charges occur.
      </p>
      {notice === 'rate' ? (
        <p role="alert">Too many checkout attempts from this account. Try again in an hour.</p>
      ) : null}
      <p>Members can save picker results and read the longer comparison notes. The public guides stay free.</p>
      {price.available ? (
        <p className="font-bold text-4xl">{formatStripeAmount(price.unitAmount, price.currency, price.interval)}</p>
      ) : price.reason === 'unconfigured' ? (
        <p>Membership billing is not available yet. We are not listing a price until Stripe returns one.</p>
      ) : (
        <p>Pricing is temporarily unavailable. We will not guess a number.</p>
      )}
      <ul className="list-disc space-y-2 pl-5">
        <li>Save the picks you want to come back to.</li>
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

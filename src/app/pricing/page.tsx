import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { NewsletterForm } from '@/components/newsletter-form'
import { StripeTestModeNotice } from '@/components/stripe-test-mode-notice'
import { checkoutNoticeMessage } from '@/lib/billing-notice'
import { FREE_SAVED_PICKS, MEMBER_PLANS, MONEY_BACK_DAYS, perMonthFromAnnual, wholeDollars, type MemberPlan } from '@/lib/membership-plans'
import { pageMetadata } from '@/lib/metadata'
import { currentClerkUserId } from '@/lib/members'
import { getMembershipPricing, type PublicPrice } from '@/lib/pricing'
import { MEMBERS_COMING_SOON_COPY } from '@/lib/pricing-view'
import { checkoutAction } from './actions'

export const metadata: Metadata = pageMetadata({
  title: 'Pricing',
  description: 'BestBotFor membership: $29 a year or $4 a month, with a 14-day money-back guarantee. The guides stay free.',
  path: '/pricing',
})

function planPrice(plan: MemberPlan, price: PublicPrice): { headline: string; detail: string | null } | null {
  if (!price.available || price.currency !== 'usd') return null
  if (plan === 'annual' && price.interval === 'year') {
    return { headline: `${wholeDollars(price.unitAmount)}/yr`, detail: `about ${perMonthFromAnnual(price.unitAmount)}/mo` }
  }
  if (plan === 'monthly' && price.interval === 'month') return { headline: `${wholeDollars(price.unitAmount)}/mo`, detail: null }
  return null
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [pricing, userId, params] = await Promise.all([getMembershipPricing(), currentClerkUserId(), searchParams])
  const notice = checkoutNoticeMessage(typeof params.notice === 'string' ? params.notice : '')
  const header = (
    <>
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Pricing', path: '/pricing' }]} />
      <h1 className="font-bold text-5xl">Membership</h1>
      <StripeTestModeNotice />
      {notice ? <p role="alert">{notice}</p> : null}
    </>
  )

  if (!pricing.configured) {
    return (
      <article className="max-w-2xl space-y-6">
        {header}
        <p className="text-xl">{MEMBERS_COMING_SOON_COPY}</p>
        <NewsletterForm source="newsletter" idSuffix="pricing" />
      </article>
    )
  }

  const { founding } = pricing
  return (
    <article className="max-w-2xl space-y-6">
      {header}
      <p>
        A free account can save {FREE_SAVED_PICKS} picks. Membership saves without a cap and opens member deal codes and the longer comparison
        notes. The public guides stay free. There is no free trial: the free account is the trial.
      </p>
      <div className="grid gap-4 sm:grid-cols-2" data-member-plans>
        {MEMBER_PLANS.map((plan) => {
          const shown = planPrice(plan, pricing.plans[plan])
          const foundingHere = plan === 'annual' && founding.open && founding.firstYearAmount != null
          return (
            <section key={plan} className="space-y-3 rounded-2xl border border-line p-5" data-plan={plan}>
              <h2 className="font-semibold text-2xl">{plan === 'annual' ? 'Annual (best value)' : 'Monthly'}</h2>
              {shown ? (
                <p>
                  <span className="font-bold text-4xl">{shown.headline}</span>
                  {shown.detail ? <span className="block text-sm">{shown.detail}</span> : null}
                </p>
              ) : (
                <p>Pricing is temporarily unavailable. We will not guess a number.</p>
              )}
              {foundingHere && shown ? (
                <p className="rounded-xl bg-mist px-3 py-2 text-sm" data-founding-offer>
                  Founding member: {wholeDollars(founding.firstYearAmount!)} for your first year, for the first 100 members. Renews at {shown.headline}.
                </p>
              ) : null}
              {shown && userId ? (
                <form action={checkoutAction}>
                  <input type="hidden" name="plan" value={plan} />
                  <button type="submit" className="min-h-12 rounded-full bg-indigo px-5 font-medium text-white">
                    {plan === 'annual' ? 'Join annually' : 'Join monthly'}
                  </button>
                </form>
              ) : null}
              {shown && !userId ? (
                <Link href="/sign-in" className="inline-flex min-h-12 items-center rounded-full bg-indigo px-5 font-medium text-white">
                  Sign in to join
                </Link>
              ) : null}
            </section>
          )
        })}
      </div>
      <ul className="list-disc space-y-2 pl-5">
        <li>Save picks without the free-account cap.</li>
        <li>Unlock member deal codes on tool pages and /deals.</li>
        <li>Read the members’ notes on comparison pages.</li>
        <li>Cancel any time in Stripe’s billing portal.</li>
      </ul>
      <p className="font-medium" data-guarantee>
        {MONEY_BACK_DAYS}-day money-back guarantee: if membership isn’t for you, email us within {MONEY_BACK_DAYS} days of paying for a full refund.
      </p>
    </article>
  )
}

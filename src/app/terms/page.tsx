import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { LawyerReviewNotice } from '@/components/lawyer-review-notice'
import { userRatingsEnabled } from '@/lib/flags'
import { pageMetadata } from '@/lib/metadata'
import { TERMS_RATINGS_PARAGRAPH, TERMS_UPDATED, TERMS_UPDATED_WITH_RATINGS } from '@/lib/ratings-policy-copy'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = pageMetadata({
  title: 'Terms of use',
  description: 'The terms for using BestBotFor, written for readers in the United States.',
  path: '/terms',
})

export default function TermsPage() {
  const ratings = userRatingsEnabled()
  return (
    <article className="max-w-2xl space-y-4">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Terms', path: '/terms' }]} />
      <h1 className="font-bold text-5xl">Terms of use</h1>
      <p>
        {ratings
          ? `These terms are a plain-language agreement for bestbotfor.com. They are not a substitute for legal advice. Last updated ${TERMS_UPDATED_WITH_RATINGS}`
          : `These terms are a plain-language agreement for bestbotfor.com. They are not a substitute for legal advice. Last updated ${TERMS_UPDATED}.`}
      </p>
      <p>
        The site is aimed at readers in the United States. Recommendations are opinions. They are not a warranty that a
        tool will fit your work, stay at a given price, or stay available.
      </p>
      <p>
        Membership, when billing is turned on, is a subscription processed by Stripe. The price is the price Stripe
        returns for the configured price. You can cancel in the billing portal. Access to members-only notes ends when
        the subscription is no longer active or trialing.
      </p>
      <p>
        Do not misuse the site, try to break the redirect, or send automated traffic at the signup form. We may rate
        limit or block that traffic.
      </p>
      <p>
        The site is provided as is. To the extent the law allows, we are not liable for indirect or consequential
        damages, or for decisions you make after reading a recommendation. Some states do not allow certain limits, so
        those limits apply only as far as they are allowed where you live.
      </p>
      <p>Questions: privacy@bestbotfor.com.</p>
      {ratings ? (
        <>
          <LawyerReviewNotice />
          <p>{TERMS_RATINGS_PARAGRAPH}</p>
          <p>
            <Link href="/review-guidelines" className="underline">Review guidelines</Link>
          </p>
        </>
      ) : null}
    </article>
  )
}

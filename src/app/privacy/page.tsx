import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { LawyerReviewNotice } from '@/components/lawyer-review-notice'
import { userRatingsEnabled } from '@/lib/flags'
import { pageMetadata } from '@/lib/metadata'
import { CLICK_LOG_PARAGRAPH, GPC_PRIVACY_PARAGRAPH, rateLimitPrivacyParagraphs, SHARING_PARAGRAPH } from '@/lib/privacy-copy'
import { PRIVACY_RATINGS_PARAGRAPHS, PRIVACY_UPDATED, PRIVACY_UPDATED_WITH_RATINGS, RETENTION_ROWS } from '@/lib/ratings-policy-copy'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = pageMetadata({
  title: 'Privacy policy',
  description: 'How BestBotFor handles analytics, cookies, Clerk, Stripe, Beehiiv, Google Analytics, Vercel, Turso, and the data we store.',
  path: '/privacy',
})

export default function PrivacyPage() {
  const ratings = userRatingsEnabled()
  return (
    <article className="max-w-2xl space-y-4">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Privacy', path: '/privacy' }]} />
      <h1 className="font-bold text-5xl">Privacy policy</h1>
      <p>
        {ratings
          ? `This policy covers bestbotfor.com, a United States site. It was last updated on ${PRIVACY_UPDATED_WITH_RATINGS}`
          : `This policy covers bestbotfor.com, a United States site. It was last updated on ${PRIVACY_UPDATED}.`}
      </p>
      <h2 className="font-semibold text-3xl">What we collect</h2>
      <p>
        If you join the newsletter, we store your email address. When our digest is connected, we also send that email
        address to Beehiiv so they can deliver it. We do not ask for your name on the form.
      </p>
      <p>
        If you create an account, Clerk handles sign-in. Clerk receives the details you give them, such as your email,
        and sets an httpOnly session cookie. We store your Clerk user id with a saved pick or a subscription, not a copy
        of your password.
      </p>
      <p>
        If you subscribe, Stripe processes the payment. We do not store your full card number. We store the Stripe
        customer id, subscription id, price id, and status so we know whether membership is active. Use Stripe test
        cards only while this site is in test mode.
      </p>
      <p>{CLICK_LOG_PARAGRAPH}</p>
      <h2 className="font-semibold text-3xl">Rate limits</h2>
      {rateLimitPrivacyParagraphs().map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <h2 className="font-semibold text-3xl">Cookies and analytics</h2>
      <p>
        Analytics cookies are off until you accept the banner. That choice is stored in a first-party cookie named
        bbf_consent. It is a preference cookie, not an advertising cookie.
      </p>
      <p>{GPC_PRIVACY_PARAGRAPH}</p>
      <p>
        If Google Analytics 4 is configured, we load it with Google Consent Mode. The default is denied. If you accept,
        we grant analytics storage only. We do not grant ad storage. We do not send your email, your name, or the text
        you type into analytics. Events are limited to starting the picker, finishing it, clicking a tool button, and
        joining the newsletter, plus the job, budget, and experience you selected.
      </p>
      <p>Vercel Analytics is cookieless and does not receive your email or name.</p>
      <p>Clerk and Stripe may set cookies that are required for sign-in and checkout. Those are not advertising cookies.</p>
      <h2 className="font-semibold text-3xl">Sharing</h2>
      <p>{SHARING_PARAGRAPH}</p>
      <h2 className="font-semibold text-3xl">Your choices</h2>
      <p>
        You can reject analytics on the banner. Global Privacy Control, described above, also opts you out of analytics.
        You can ask us to delete a newsletter address or a saved pick by emailing
        privacy@bestbotfor.com. Account deletion is also available from the Clerk account button when sign-in is enabled.
        Stripe’s billing portal is where you manage a subscription.
      </p>
      <p>
        Residents of states with privacy laws, including California, can email that address to request access or deletion.
        We will not discriminate against you for asking.
      </p>
      {ratings ? (
        <>
          <h2 className="font-semibold text-3xl">Ratings and reviews</h2>
          <LawyerReviewNotice />
          {PRIVACY_RATINGS_PARAGRAPHS.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <h2 className="font-semibold text-3xl">How long we keep rating data</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <caption className="sr-only">How long rating data is kept</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3">Data</th>
                  <th scope="col" className="py-2">Kept for</th>
                </tr>
              </thead>
              <tbody>
                {RETENTION_ROWS.map((row) => (
                  <tr key={row.data} className="border-b border-line">
                    <th scope="row" className="py-3 pr-3 font-normal">{row.data}</th>
                    <td className="py-3">{row.kept}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <Link href="/review-guidelines" className="underline">Review guidelines</Link>
          </p>
        </>
      ) : null}
    </article>
  )
}

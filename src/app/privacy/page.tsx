import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { pageMetadata } from '@/lib/metadata'

export const metadata: Metadata = pageMetadata({
  title: 'Privacy policy',
  description: 'How BestBotFor handles analytics, cookies, Clerk, Stripe, Beehiiv, and the data we store.',
  path: '/privacy',
})

export default function PrivacyPage() {
  return (
    <article className="max-w-2xl space-y-4">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Privacy', path: '/privacy' }]} />
      <h1 className="font-serif text-5xl">Privacy policy</h1>
      <p>This policy covers bestbotfor.com, a United States site. It was last updated on October 15, 2026.</p>
      <h2 className="font-serif text-3xl">What we collect</h2>
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
      <p>
        When you use a “Visit” button, we log the tool, the time, the page path on our site if the referrer is ours,
        and a country code when the host provides one. We store a hash of the IP address only if a server salt is
        configured. Otherwise we store no IP. We never store the raw IP address.
      </p>
      <h2 className="font-serif text-3xl">Cookies and analytics</h2>
      <p>
        Analytics cookies are off until you accept the banner. That choice is stored in a first-party cookie named
        bbf_consent. It is a preference cookie, not an advertising cookie.
      </p>
      <p>
        If Google Analytics 4 is configured, we load it with Google Consent Mode. The default is denied. If you accept,
        we grant analytics storage only. We do not grant ad storage. We do not send your email, your name, or the text
        you type into analytics. Events are limited to starting the picker, finishing it, clicking a tool button, and
        joining the newsletter, plus the job, budget, and experience you selected.
      </p>
      <p>Vercel Analytics is cookieless and does not receive your email or name.</p>
      <p>Clerk and Stripe may set cookies that are required for sign-in and checkout. Those are not advertising cookies.</p>
      <h2 className="font-serif text-3xl">Sharing</h2>
      <p>
        We use Clerk for accounts, Stripe for payments, Beehiiv for the digest when it is connected, and Vercel to host
        the site. We do not sell personal information.
      </p>
      <h2 className="font-serif text-3xl">Your choices</h2>
      <p>
        You can reject analytics on the banner. You can ask us to delete a newsletter address or a saved pick by emailing
        privacy@bestbotfor.com. Account deletion is also available from the Clerk account button when sign-in is enabled.
        Stripe’s billing portal is where you manage a subscription.
      </p>
      <p>
        Residents of states with privacy laws, including California, can email that address to request access or deletion.
        We will not discriminate against you for asking.
      </p>
    </article>
  )
}

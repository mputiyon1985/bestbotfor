import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import {
  AUDIT_DELIVERY,
  AUDIT_PAYMENT_URL,
  AUDIT_PRICE_LABEL,
  AUDIT_REFUND_LINE,
} from '@/lib/audit-offer'
import { pageMetadata } from '@/lib/metadata'
import { SPONSOR_CONTACT_EMAIL, SPONSOR_CONTACT_MAILTO } from '@/lib/sponsor-checkout-gate'

/**
 * Unlisted at launch: noindex and not in the sitemap or the main navigation.
 * Share the link in emails and posts first. Flip noIndex and add '/audit' to
 * SITEMAP_STATIC_PATHS once the offer has run for a while.
 */
export const metadata: Metadata = pageMetadata({
  title: 'AI Stack Audit',
  description:
    'A personal review of which AI tools are worth paying for in your business, in plain English, delivered within 2 business days.',
  path: '/audit',
  noIndex: true,
})

export default function AuditPage() {
  return (
    <article className="max-w-2xl space-y-4">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'AI Stack Audit', path: '/audit' }]} />
      <h1 className="font-bold text-5xl">AI Stack Audit</h1>
      <p>
        Most small businesses are told to use ten AI tools. Usually two or three are worth paying for. I will tell you
        which ones for your work.
      </p>
      <h2 className="font-bold text-2xl">What you get</h2>
      <p>
        You tell me what your business does and what slows you down. Then, {AUDIT_DELIVERY}, you get a one to two page
        plan in plain English:
      </p>
      <ul className="list-disc space-y-1 pl-6">
        <li>The two or three AI tools I would use for your work</li>
        <li>What each one costs, and what to skip</li>
        <li>The first three things to try this week</li>
      </ul>
      <h2 className="font-bold text-2xl">Price</h2>
      <p>
        {AUDIT_PRICE_LABEL}. {AUDIT_REFUND_LINE}
      </p>
      <p>
        <a
          className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
          href={AUDIT_PAYMENT_URL}
          rel="noopener"
        >
          Order your audit
        </a>
      </p>
      <p className="text-sm text-muted">Payment happens on Stripe&apos;s hosted page. This site does not collect card numbers.</p>
      <h2 className="font-bold text-2xl">How I stay neutral</h2>
      <p>
        No tool maker pays to change what an audit recommends. If I recommend a tool that BestBotFor has an affiliate
        link for, the audit says so. See{' '}
        <Link href="/disclosure" className="underline">
          Disclosures
        </Link>
        .
      </p>
      <h2 className="font-bold text-2xl">Who does it</h2>
      <p>
        Mark Putiyon, owner and editor-in-chief of BestBotFor. Questions:{' '}
        <a className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href={SPONSOR_CONTACT_MAILTO}>
          {SPONSOR_CONTACT_EMAIL}
        </a>
      </p>
    </article>
  )
}

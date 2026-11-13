import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/breadcrumbs'
import {
  BUILD_ADDON_CTA,
  BUILD_ADDON_LINE,
  BUILD_ADDON_URL,
  BUILD_FULFILLMENT,
  BUILD_INTRO_NOTE,
  BUILD_ONE_TIME_NOTICE,
  BUILD_PRICE_LINE,
  BUILD_SESSION_CTA,
  BUILD_SESSION_URL,
} from '@/lib/build-offer'
import { pageMetadata } from '@/lib/metadata'
import { SPONSOR_CONTACT_EMAIL, SPONSOR_CONTACT_MAILTO } from '@/lib/sponsor-checkout-gate'
import { visibleToolCountLabel } from '@/lib/visible-tool-count'

export const metadata: Metadata = pageMetadata({
  title: 'AI Tool Audit + Setup',
  description:
    'A 60-minute working session, a short written plan, and hands-on setup of one AI tool or agent. $497, one time. Mark emails you within 1 business day to book it.',
  path: '/build',
})

export default async function BuildPage() {
  const toolCountLabel = await visibleToolCountLabel()
  const guide = toolCountLabel
    ? `BestBotFor is the guide for picking one AI tool for a job, with ${toolCountLabel}.`
    : 'BestBotFor is the guide for picking one AI tool for a job.'

  return (
    <article className="max-w-2xl space-y-6">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'AI Tool Audit + Setup', path: '/build' }]} />
      <h1 className="font-bold text-5xl">AI Tool Audit + Setup</h1>
      <p>
        {guide} A lot of small businesses need someone to look at how they actually work, pick the right tools, and set
        the first one up.
      </p>
      <h2 className="font-bold text-2xl">What you get</h2>
      <p>AI Tool Audit + Setup is a one-time, fixed-price service. It includes:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>A 60-minute working session that maps your current tools and the work that is still manual</li>
        <li>A short written plan with the 3–5 AI tools or agents to use, and what to skip</li>
        <li>Hands-on setup of one primary tool or agent: accounts, the first workflow, and a simple how-to you can repeat</li>
        <li>14 days of email support for that setup</li>
      </ul>
      <h2 className="font-bold text-2xl">Price</h2>
      <p>
        {BUILD_PRICE_LINE} {BUILD_INTRO_NOTE}
      </p>
      <p>
        {BUILD_ADDON_LINE} {BUILD_ONE_TIME_NOTICE}
      </p>
      <p>
        <a className="inline-flex min-h-12 items-center rounded-full bg-indigo px-5 font-semibold text-white" href={BUILD_SESSION_URL} rel="noopener">
          {BUILD_SESSION_CTA}
        </a>
      </p>
      <p>{BUILD_FULFILLMENT}</p>
      <p>
        <a className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href={BUILD_ADDON_URL} rel="noopener">
          {BUILD_ADDON_CTA}
        </a>
      </p>
      <p className="text-sm text-muted">Payment happens on Stripe’s hosted page. This site does not collect card numbers.</p>
      <h2 className="font-bold text-2xl">Who runs it</h2>
      <p>
        Mark Putiyon, Editor-in-Chief of BestBotFor, runs the session. Questions:{' '}
        <a className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href={SPONSOR_CONTACT_MAILTO}>
          {SPONSOR_CONTACT_EMAIL}
        </a>
      </p>
      <h2 className="font-bold text-2xl">How recommendations stay independent</h2>
      <p>
        No tool maker pays to change what this session recommends. If a tool in the plan has a BestBotFor affiliate link, the written plan says so. See{' '}
        <Link href="/disclosure" className="underline">
          Disclosures
        </Link>
        .
      </p>
    </article>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { comparePairSeeds, toolSeeds } from '@/data/catalog'
import { listTasks } from '@/lib/catalog'
import { portalNoticeMessage } from '@/lib/billing-notice'
import { budgetLabel, skillLabel } from '@/lib/format'
import { pageMetadata } from '@/lib/metadata'
import { listSavedPicks, memberAccess, stripeCustomerIdForUser } from '@/lib/members'
import { portalAction } from './actions'

export const metadata: Metadata = pageMetadata({
  title: 'Members',
  description: 'Saved picks and membership status for BestBotFor.',
  path: '/members',
  noIndex: true,
})

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const access = await memberAccess()
  const params = await searchParams
  const checkout = typeof params.checkout === 'string' ? params.checkout : ''
  const notice = portalNoticeMessage(typeof params.notice === 'string' ? params.notice : '')

  if (!access.allowed) {
    return (
      <article className="max-w-2xl space-y-4">
        <h1 className="font-bold text-5xl">Members</h1>
        {checkout === 'success' ? <p>Payment is processing. Membership opens when Stripe confirms the subscription.</p> : null}
        {notice ? <p role="alert">{notice}</p> : null}
        {access.reason === 'billing-disabled' ? (
          <p>Membership billing is not available on this server yet.</p>
        ) : (
          <p>An active membership is required for saved picks and the longer comparison notes.</p>
        )}
        <Link href="/pricing" className="inline-flex min-h-12 items-center font-semibold underline">
          View pricing
        </Link>
      </article>
    )
  }

  const picks = await listSavedPicks(access.userId)
  const taskList = await listTasks()
  const customer = await stripeCustomerIdForUser(access.userId)

  return (
    <article className="space-y-8">
      <h1 className="font-bold text-5xl">Your membership</h1>
      <p>Your subscription is active. Saved picks and the comparison notes are open.</p>
      {notice ? <p role="alert">{notice}</p> : null}
      {customer ? (
        <form action={portalAction}>
          <button type="submit" className="min-h-12 rounded-full border border-ink px-5 font-semibold">
            Manage billing
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted">The billing portal appears after Stripe sends a customer id.</p>
      )}
      <section>
        <h2 className="font-semibold text-3xl">Saved picks</h2>
        {picks.length === 0 ? (
          <p className="mt-2 text-muted">You have not saved a pick yet. Run the picker and choose “Save this pick.”</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {picks.map((pick) => {
              const task = taskList.find((item) => item.slug === pick.taskSlug)
              const href = `/result?task=${pick.taskSlug}&budget=${pick.budget}&skill=${pick.skill}`
              return (
                <li key={pick.id}>
                  <Link className="underline" href={href}>
                    {task?.name ?? pick.taskSlug}
                  </Link>
                  <span className="text-muted">
                    {' '}
                    — {budgetLabel[pick.budget as 'free' | 'low' | 'any'] ?? pick.budget},{' '}
                    {skillLabel[pick.skill as 'beginner' | 'intermediate' | 'pro'] ?? pick.skill}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <section>
        <h2 className="font-semibold text-3xl">Deep dives</h2>
        <ul className="mt-3 space-y-2">
          {comparePairSeeds.map(([a, b]) => (
            <li key={`${a}-${b}`}>
              <Link className="underline" href={`/compare/${a}-vs-${b}`}>
                {toolName.get(a) ?? a} vs {toolName.get(b) ?? b}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </article>
  )
}

const toolName = new Map(toolSeeds.map((tool) => [tool.slug, tool.name]))

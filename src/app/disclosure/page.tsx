import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { pageMetadata } from '@/lib/metadata'

export const metadata: Metadata = pageMetadata({
  title: 'Affiliate disclosure',
  description: 'How BestBotFor handles affiliate links, commissions, and recommendations.',
  path: '/disclosure',
})

export default function DisclosurePage() {
  return (
    <article className="max-w-2xl space-y-4">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Affiliate disclosure', path: '/disclosure' }]} />
      <h1 className="font-bold text-5xl">Affiliate disclosure</h1>
      <p>
        BestBotFor may earn money if we later join an affiliate or referral program and you buy through a link we
        control. That relationship would not change the editorial rank.
      </p>
      <p>
        Today, every “Visit” button goes to the tool’s official website. We do not attach an affiliate code, and the
        affiliate URL field in our database is unused. Some vendors publish a program. We have not applied, and we do
        not claim a commission until a program is approved and a real tracking link is in use.
      </p>
      <p>
        Commission notes on a tool profile are copied from the vendor’s own page. If the vendor did not publish a rate,
        we do not invent one.
      </p>
      <p>Recommendations are opinions based on the catalog, not a promise that a tool will work for your project.</p>
      <p>Tool logos and icons are trademarks of their owners. They are used on BestBotFor for identification only and do not imply endorsement.</p>
    </article>
  )
}

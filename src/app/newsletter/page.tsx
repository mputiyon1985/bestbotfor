import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { NewsletterForm } from '@/components/newsletter-form'
import { pageMetadata } from '@/lib/metadata'

export const metadata: Metadata = pageMetadata({
  title: 'The Daily Bot',
  description: 'The Daily Bot: a free AI newsletter. First issue coming soon. Unsubscribe anytime.',
  path: '/newsletter',
})

export default function NewsletterPage() {
  return (
    <article className="max-w-xl space-y-4">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Newsletter', path: '/newsletter' }]} />
      <h1 className="font-bold text-5xl">The Daily Bot</h1>
      <p className="text-lg text-muted">Free AI newsletter, first issue coming soon.</p>
      <p>
        A short, plain-English note on AI tools and agents: what launched, what changed price, and which bot we’d pick this week. We store your email on our servers. When the digest is
        connected to Beehiiv, that is where the issues are sent. If Beehiiv asks you to confirm, check your inbox.
      </p>
      <NewsletterForm source="newsletter" />
    </article>
  )
}

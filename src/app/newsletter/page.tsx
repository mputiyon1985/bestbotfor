import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { NewsletterForm } from '@/components/newsletter-form'
import { pageMetadata } from '@/lib/metadata'

export const metadata: Metadata = pageMetadata({
  title: 'Newsletter',
  description: 'Sign up for the BestBotFor daily AI digest. We store your email, and Beehiiv delivers it when connected.',
  path: '/newsletter',
})

export default function NewsletterPage() {
  return (
    <article className="max-w-xl space-y-4">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Newsletter', path: '/newsletter' }]} />
      <h1 className="font-serif text-5xl">Daily AI digest</h1>
      <p>
        A short, plain-English note on AI tools and agents. We store your email on our servers. When the digest is
        connected to Beehiiv, that is where the issues are sent. If Beehiiv asks you to confirm, check your inbox.
      </p>
      <NewsletterForm />
    </article>
  )
}

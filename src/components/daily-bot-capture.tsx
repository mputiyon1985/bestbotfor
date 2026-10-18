import { NewsletterForm } from './newsletter-form'
import type { NewsletterSource } from '@/lib/newsletter-source'

export function DailyBotCapture({ source }: { source: Exclude<NewsletterSource, 'newsletter'> }) {
  return (
    <section aria-labelledby={`${source}-daily-bot`} className="rounded-3xl border border-line bg-card px-4 py-6 md:px-6">
      <h2 id={`${source}-daily-bot`} className="font-semibold text-3xl">
        The Daily Bot
      </h2>
      <p className="mt-2 max-w-xl text-muted">
        A free AI newsletter: what launched, what changed price, and which bot we’d pick. First issue coming soon. We store your email.
        When the digest is connected to Beehiiv, that is where it is sent. Unsubscribe anytime.
      </p>
      <div className="mt-4 max-w-xl">
        <NewsletterForm source={source} />
      </div>
    </section>
  )
}

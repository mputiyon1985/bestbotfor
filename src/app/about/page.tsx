import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { EDITOR_BIO } from '@/content/category-guides'
import { pageMetadata } from '@/lib/metadata'
import { BUSINESS_PHONE_DISPLAY, BUSINESS_PHONE_HREF, TAGLINE } from '@/lib/site'

export const metadata: Metadata = pageMetadata({
  title: 'About',
  description: 'How BestBotFor picks the right AI in 30 seconds: three questions, an editorial fit score, and rankings that affiliate programs never change.',
  path: '/about',
})

export default function AboutPage() {
  return (
    <article className="max-w-2xl space-y-4">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }]} />
      <h1 className="font-bold text-5xl">About BestBotFor</h1>
      <p>{TAGLINE}</p>
      <p>
        BestBotFor is a United States guide for people who want a straight answer: which AI tool should I use for this job?
        You answer three questions: what you want to do, what you can spend, and how experienced you are. We name one tool and up to six alternatives that clear a minimum fit score. A strong tool just over your budget can still appear, and it is labeled.
      </p>
      <p>
        The rank starts from an editorial fit score for the job. Budget and experience shift that score by a fixed amount.
        A tool does not rank higher because it has an affiliate program. Most buttons on this site go to each company’s
        own website. When a button uses an affiliate link, a note next to it says so, and we may earn a commission.
      </p>
      <p>
        The catalog was reviewed on October 15, 2026. Product details change. Check the vendor’s site before you pay or
        install anything.
      </p>
      <h2 className="font-bold text-2xl">Our editor</h2>
      <p data-editor-bio>{EDITOR_BIO}</p>
      <h2 className="font-bold text-2xl">Contact</h2>
      <p>
        Call us at{' '}
        <a className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" href={BUSINESS_PHONE_HREF}>
          {BUSINESS_PHONE_DISPLAY}
        </a>
        .
      </p>
    </article>
  )
}

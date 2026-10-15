import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { pageMetadata } from '@/lib/metadata'
import { TAGLINE } from '@/lib/site'

export const metadata: Metadata = pageMetadata({
  title: 'About',
  description: 'BestBotFor is a United States guide that names one AI tool for the job and two alternatives.',
  path: '/about',
})

export default function AboutPage() {
  return (
    <article className="max-w-2xl space-y-4">
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }]} />
      <h1 className="font-serif text-5xl">About BestBotFor</h1>
      <p>{TAGLINE}</p>
      <p>
        BestBotFor is a United States guide for people who want a straight answer: which AI tool should I use for this job?
        You answer three questions. We name one tool and two alternatives.
      </p>
      <p>
        The rank starts from an editorial fit score for the job. Budget and experience shift that score by a fixed amount.
        A tool does not rank higher because it has an affiliate program. We are not enrolled in those programs, and the
        buttons on this site go to each company’s own website.
      </p>
      <p>
        The catalog was reviewed on October 15, 2026. Product details change. Check the vendor’s site before you pay or
        install anything.
      </p>
    </article>
  )
}

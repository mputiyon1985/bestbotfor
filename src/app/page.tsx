import Link from 'next/link'
import { headers } from 'next/headers'
import { JsonLd } from '@/components/json-ld'
import { PickerForm } from '@/components/picker-form'
import { comparePairSeeds, taskSeeds } from '@/data/catalog'
import { listTasks } from '@/lib/catalog'
import { faqJsonLd } from '@/lib/jsonld'
import { TAGLINE } from '@/lib/site'

const faqs = [
  {
    question: 'How does BestBotFor pick a tool?',
    answer:
      'You answer three questions: the job, your budget, and your experience. We rank tools that clear a minimum fit score by editorial fit, then adjust for budget and skill. You get one pick and up to five alternatives. A tool just over budget can still appear when it clears that bar, and it is labeled. When fewer than five alternatives qualify, the page says so. Affiliate programs do not change the rank.',
  },
  {
    question: 'Do I need an account?',
    answer: 'No. The picker works without signing in. A membership is only for saving picks and reading the longer comparisons.',
  },
  {
    question: 'Do you earn money from the recommendations?',
    answer:
      'Outbound buttons go to each tool’s own website. We are not passing an affiliate code today. If we join a program later, we may earn a commission, and the disclosure page says so. Payment does not buy a higher rank.',
  },
  {
    question: 'How current is the information?',
    answer: 'The catalog was reviewed on October 15, 2026. Prices change. Confirm the current price on the tool’s site before you pay.',
  },
]

export default async function HomePage() {
  const catalogTasks = await listTasks()
  const nonce = (await headers()).get('x-nonce')
  const tasks = catalogTasks.length > 0 ? catalogTasks : taskSeeds

  return (
    <div className="space-y-16">
      <JsonLd data={faqJsonLd(faqs)} nonce={nonce} />
      <section className="grid gap-8 md:grid-cols-[1.1fr_0.9fr] md:items-end">
        <div>
          <h1 className="font-headline text-5xl leading-tight md:text-6xl">{TAGLINE}</h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Tell us the job, your budget, and how experienced you are. You’ll get one AI tool and up to five alternatives, in plain English.
          </p>
        </div>
        <p className="rounded-3xl bg-mist px-5 py-4 text-sm text-accent">
          No account required. The result has its own link, so you can send it to someone else.
        </p>
      </section>

      <PickerForm tasks={tasks} />

      <section>
        <h2 className="font-semibold text-3xl">Popular jobs</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <li key={task.slug}>
              <Link href={`/best/${task.slug}`} className="block min-h-12 rounded-2xl border border-line bg-card px-4 py-3 hover:border-accent">
                <span className="font-semibold">{task.name}</span>
                <span className="mt-1 block text-sm text-muted">{task.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold text-3xl">Side by side</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {comparePairSeeds.slice(0, 8).map(([a, b]) => (
            <li key={`${a}-${b}`}>
              <Link href={`/compare/${a}-vs-${b}`} className="block min-h-12 rounded-2xl border border-line px-4 py-3 font-semibold hover:border-accent">
                {label(a)} vs {label(b)}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold text-3xl">Questions</h2>
        <dl className="mt-4 space-y-4">
          {faqs.map((faq) => (
            <div key={faq.question}>
              <dt className="font-semibold">{faq.question}</dt>
              <dd className="text-muted">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}

function label(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

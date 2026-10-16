import Link from 'next/link'
import { headers } from 'next/headers'
import { JsonLd } from '@/components/json-ld'
import { PICKER_QUESTIONS, PickerForm } from '@/components/picker-form'
import { comparePairSeeds, taskSeeds, toolSeeds } from '@/data/catalog'
import { listTasks } from '@/lib/catalog'
import { faqJsonLd } from '@/lib/jsonld'
import { TAGLINE } from '@/lib/site'

const faqs = [
  {
    question: 'How does BestBotFor pick a tool?',
    answer:
      'You answer three questions: the job, your budget, and your experience. We rank tools that clear a minimum fit score by editorial fit, then adjust for budget and skill. You get one pick and up to six alternatives. A tool just over budget can still appear when it clears that bar, and it is labeled. When fewer than six alternatives qualify, the page says so. Affiliate programs do not change the rank.',
  },
  {
    question: 'Does it really take 30 seconds?',
    answer:
      'It’s three questions, each answered with a single choice, and the result page loads as soon as you submit. There’s no sign-up step in between.',
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
    <div className="space-y-8 md:space-y-16">
      <JsonLd data={faqJsonLd(faqs)} nonce={nonce} />
      <section className="grid gap-3 md:grid-cols-[1.1fr_0.9fr] md:items-end md:gap-8">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-accent">Answer 3 quick questions</p>
          <h1 className="mt-3 font-headline text-4xl leading-tight md:text-6xl">{TAGLINE}</h1>
          <p className="mt-2 max-w-xl text-base text-muted md:mt-4 md:text-lg">
            Answer three quick questions: what you want to do, what you can spend, and how experienced you are. You’ll get one AI tool for the job and up to six alternatives, with a plain-English reason for each.
          </p>
        </div>
        <p className="rounded-3xl bg-mist px-4 py-3 text-sm text-accent md:px-5 md:py-4">
          No account needed. Your result gets its own link, so you can share it with your team or your Discord.
        </p>
      </section>

      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="font-semibold text-3xl">How it works: three questions, about 30 seconds</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          <li className="rounded-2xl border border-line bg-card px-4 py-3">
            <span className="font-semibold">{PICKER_QUESTIONS[0]}</span>
            <span className="mt-1 block text-sm text-muted">Pick the job: write code, build an app from a prompt, make a video, create a voiceover, automate a workflow, and more.</span>
          </li>
          <li className="rounded-2xl border border-line bg-card px-4 py-3">
            <span className="font-semibold">{PICKER_QUESTIONS[1]}</span>
            <span className="mt-1 block text-sm text-muted">Free only, low cost, or any budget.</span>
          </li>
          <li className="rounded-2xl border border-line bg-card px-4 py-3">
            <span className="font-semibold">{PICKER_QUESTIONS[2]}</span>
            <span className="mt-1 block text-sm text-muted">Beginner, intermediate, or advanced.</span>
          </li>
        </ol>
        <p className="mt-4 text-muted">You get one pick and up to six alternatives, side by side, with the reason we chose each. Budget and experience change the answer. That’s why we ask.</p>
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

const toolName = new Map(toolSeeds.map((tool) => [tool.slug, tool.name]))

function label(slug: string): string {
  return toolName.get(slug) ?? slug
}

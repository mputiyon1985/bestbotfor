import { CATALOG_TASK_COUNT, CATALOG_TOOL_COUNT } from '@/lib/seo-pages'

/**
 * Static guide copy for /guides/[slug]. Spec: docs/specs/seo-20-pages/10-guide-how-to-choose-an-ai-tool.md.
 * Facts are limited to what the site already states: catalog counts (from the
 * seed), the three picker questions and their options, and the How we rate
 * method. No prices, volumes or third-party claims.
 */
export type GuideSection = {
  id: string
  heading: string
  paragraphs: string[]
  /** Bulleted terms with an explanation, rendered as a definition list. */
  terms?: { term: string; detail: string }[]
  /** Render the task list (links to every /best/[task]) under this section. */
  taskLinks?: boolean
  /** One inline link at the end of the section. */
  link?: { href: string; label: string }
}

export type Guide = {
  slug: string
  title: string
  description: string
  heading: string
  crumb: string
  answer: string
  sections: GuideSection[]
  faqs: { question: string; answer: string }[]
  /** ISO date the copy was last reviewed. */
  updatedAt: string
}

export const GUIDES: readonly Guide[] = [
  {
    slug: 'how-to-choose-an-ai-tool',
    title: 'How to Choose an AI Tool: 3 Questions That Decide It',
    description: `How to choose the right AI tool: the job, your budget and your experience. A plain-English method, plus the best pick for ${CATALOG_TASK_COUNT} jobs. Takes 30 seconds.`,
    heading: 'How to choose an AI tool',
    crumb: 'How to choose an AI tool',
    answer: `Start with the job, then your budget, then your experience. Name the one thing you want the tool to do, decide what you can spend, and be honest about how technical you are. Those three answers narrow ${CATALOG_TOOL_COUNT} tools to one pick and up to six alternatives.`,
    sections: [
      {
        id: 'job',
        heading: 'Question 1: What do you want to do?',
        paragraphs: [
          'Choose the job first, not the tool. A tool that is famous for one job can be an average pick for another, so the job decides which tools are worth comparing at all.',
          `We cover ${CATALOG_TASK_COUNT} jobs. Each one has its own ranking:`,
        ],
        taskLinks: true,
      },
      {
        id: 'budget',
        heading: 'Question 2: What can you spend?',
        paragraphs: ['The picker offers three budgets. Each one changes which tools rank highest for your job.'],
        terms: [
          { term: 'Free only', detail: 'Tools that are free or have a free tier. Free plans have limits, so check what the free plan includes on the vendor’s site.' },
          { term: 'Low cost', detail: 'Tools with a free tier or a low starting price rank higher. Pricier tools can still appear if they fit the job much better.' },
          { term: 'Any budget', detail: 'Price does not change the ranking. The best fit for the job comes first.' },
        ],
      },
      {
        id: 'experience',
        heading: 'Question 3: How experienced are you?',
        paragraphs: ['Every tool in the catalog is tagged with the experience level it suits. The picker favors tools that match yours.'],
        terms: [
          { term: 'Beginner', detail: 'You want something that works without setup or technical knowledge.' },
          { term: 'Intermediate', detail: 'You are comfortable with settings, templates and some trial and error.' },
          { term: 'Advanced', detail: 'You are happy with code, APIs or complex workflows if the result is better.' },
        ],
      },
      {
        id: 'fit',
        heading: 'How we score fit',
        paragraphs: [
          'Fit is how well a tool matches a job, shown as a percentage. It is an editorial score. Your budget and experience then adjust the order within a limited range, so a poor fit cannot jump to the top just because it is cheap.',
          'Ratings compare each tool with rivals that do the same job, using quality, features, value and ease. Payment never buys a higher rank.',
        ],
        link: { href: '/how-we-rate', label: 'Read how we rate tools' },
      },
      {
        id: 'mistakes',
        heading: 'Common mistakes',
        paragraphs: [],
        terms: [
          { term: 'Picking the most famous tool', detail: 'The best-known name is often a general-purpose tool. A tool built for your job can fit it better.' },
          { term: 'Paying before testing a free tier', detail: 'Many tools have a free plan. Try the job you actually need on it before you pay.' },
        ],
        link: { href: '/tools', label: `Browse all ${CATALOG_TOOL_COUNT} tools` },
      },
    ],
    faqs: [
      {
        question: 'Which AI should I use?',
        answer: 'It depends on the job. Pick what you want to do, then your budget and experience, and use the tool that fits that job best rather than the most popular one.',
      },
      {
        question: 'Do I need to pay for an AI tool?',
        answer: 'Not always. Many tools have a free tier. Choose Free only in the picker to see tools you can start without paying, and check the free plan’s limits on the vendor’s site.',
      },
      {
        question: 'How long does choosing take?',
        answer: 'About 30 seconds. The picker on the home page asks three questions and returns one pick and up to six alternatives.',
      },
    ],
    updatedAt: '2026-10-18',
  },
] as const

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug)
}

export function guidePath(slug: string): string {
  return `/guides/${slug}`
}

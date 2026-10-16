import { overallScore, type EditorialSeed } from '@/lib/editorial'

/**
 * Editorial scores and pros/cons for tools whose official docs and pricing
 * pages were read on 2026-10-16. The full catalog is not scored here.
 * Overall must equal the weighted average in src/lib/editorial.ts.
 * Do not add a row without a source URL for every claim.
 */
const REVIEWED = '2026-10-16'

const claudePricing = 'https://claude.com/pricing'
const chatgptPricing = 'https://chatgpt.com/pricing'
const cursorDocs = 'https://cursor.com/docs'
const cursorPricing = 'https://cursor.com/docs/models'

export const editorialSeeds: EditorialSeed[] = [
  {
    slug: 'claude',
    features: 4,
    value: 4,
    ease: 5,
    quality: 4,
    overall: overallScore({ features: 4, value: 4, ease: 5, quality: 4 }),
    reviewedAt: REVIEWED,
    sources: [claudePricing],
    rationale:
      'Claude’s pricing page lists a free plan with chat on the web, desktop, and mobile, web search, Artifacts, voice, and up to five projects. Pro is $20 a month, or $17 a month when $200 is billed annually, and adds Claude Code, Research, and more models. Every plan has usage limits. Quality here is the documented model list and context window of up to 1M tokens, not a benchmark.',
    pros: [
      { text: 'The free plan includes chat on the web, desktop, and mobile.', sourceUrl: claudePricing },
      { text: 'The free plan includes Artifacts, voice mode, and web search.', sourceUrl: claudePricing },
      { text: 'Pro is $20 a month, or $17 a month billed annually, and adds Claude Code.', sourceUrl: claudePricing },
    ],
    cons: [
      { text: 'Every plan has usage limits, including the free plan.', sourceUrl: claudePricing },
      { text: 'Claude Code and Research are not included on the free plan.', sourceUrl: claudePricing },
      { text: 'Max starts at $100 a month.', sourceUrl: claudePricing },
    ],
  },
  {
    slug: 'chatgpt',
    features: 4,
    value: 4,
    ease: 4,
    quality: 4,
    overall: overallScore({ features: 4, value: 4, ease: 4, quality: 4 }),
    reviewedAt: REVIEWED,
    sources: [chatgptPricing],
    rationale:
      'ChatGPT’s pricing page says the free plan includes unlimited everyday text chats with GPT-6, subject to abuse guardrails, and limits uploads, images, voice, deep research, memory, and Codex. Plus adds projects, custom GPTs, scheduled tasks, and expanded access to those tools. The comparison we read did not print a dollar price for Plus, so value is scored from the free tier and the listed upgrades. Quality is that documented model access, not a benchmark.',
    pros: [
      { text: 'The free plan includes unlimited everyday text chats with GPT-6, subject to abuse guardrails.', sourceUrl: chatgptPricing },
      { text: 'Plus adds projects, custom GPTs, and scheduled tasks.', sourceUrl: chatgptPricing },
      { text: 'Plus expands Codex, deep research, memory, and image creation.', sourceUrl: chatgptPricing },
    ],
    cons: [
      { text: 'Uploads, images, voice, deep research, memory, and Codex are limited on the free plan.', sourceUrl: chatgptPricing },
      { text: 'The Go plan may include ads.', sourceUrl: chatgptPricing },
      { text: 'Free ChatGPT Work is limited to the desktop app.', sourceUrl: chatgptPricing },
    ],
  },
  {
    slug: 'cursor',
    features: 4,
    value: 3,
    ease: 3,
    quality: 4,
    overall: overallScore({ features: 4, value: 3, ease: 3, quality: 4 }),
    reviewedAt: REVIEWED,
    sources: [cursorDocs, cursorPricing],
    rationale:
      'Cursor’s docs describe a desktop coding agent for planning features, fixing bugs, and reviewing changes. The models page lists a free plan at $0 with limited Agent and Chat, Plus at $8 a month without third-party models, and Premium at $30 a month with cloud agents and Bugbot. Third-party models bill separately at API list price. Quality is that documented workflow, not a benchmark we ran.',
    pros: [
      { text: 'The docs describe an agent that can plan features, fix bugs, and review changes in a repo.', sourceUrl: cursorDocs },
      { text: 'The free plan includes limited Agent and Chat at $0.', sourceUrl: cursorPricing },
      { text: 'Premium at $30 a month adds cloud agents, Bugbot, and third-party models.', sourceUrl: cursorPricing },
    ],
    cons: [
      { text: 'Free and Plus do not include third-party models.', sourceUrl: cursorPricing },
      { text: 'Third-party models on Premium bill at API list price from prepaid credit.', sourceUrl: cursorPricing },
      { text: 'You install the app; the docs start from a download, not a browser tab.', sourceUrl: cursorDocs },
    ],
  },
]

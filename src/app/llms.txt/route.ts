import { comparePairSeeds } from '@/data/catalog'
import { getCatalog } from '@/lib/catalog'
import { getSiteUrl, TAGLINE } from '@/lib/site'

export const dynamic = 'force-dynamic'

export async function GET() {
  const site = getSiteUrl()
  const catalog = await getCatalog()
  const lines = [
    '# BestBotFor',
    '',
    `> ${TAGLINE}`,
    '',
    'BestBotFor recommends one AI tool and two alternatives from three questions: the job, the budget, and experience.',
    '',
    '## Guides',
    ...catalog.tasks.map((task) => `- [Best AI tool for ${task.name}](${site}/best/${task.slug}): ${task.description}`),
    '',
    '## Comparisons',
    ...comparePairSeeds.map(([a, b]) => `- [${a} vs ${b}](${site}/compare/${a}-vs-${b})`),
    '',
    '## Tools',
    `- [All tools](${site}/tools): the full catalog. Filter with \`?category=\`.`,
    ...catalog.tools.map((tool) => `- [${tool.name}](${site}/tools/${tool.slug}): ${tool.shortDesc}`),
    '',
    '## Policies',
    `- [About](${site}/about)`,
    `- [Affiliate disclosure](${site}/disclosure)`,
    `- [Privacy](${site}/privacy)`,
    `- [Terms](${site}/terms)`,
  ]
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

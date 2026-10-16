import { comparePairSeeds } from '@/data/catalog'
import { listTasks, listToolSummaries } from '@/lib/catalog'
import { getSiteUrl, TAGLINE } from '@/lib/site'

export const dynamic = 'force-dynamic'

export async function GET() {
  const site = getSiteUrl()
  const [taskList, toolList] = await Promise.all([listTasks(), listToolSummaries()])
  const lines = [
    '# BestBotFor',
    '',
    `> ${TAGLINE}`,
    '',
    'BestBotFor recommends one AI tool and up to six alternatives from three questions: the job, the budget, and experience.',
    '',
    '## Guides',
    ...taskList.map((task) => `- [Best AI tool for ${task.name}](${site}/best/${task.slug}): ${task.description}`),
    '',
    '## Comparisons',
    ...comparePairSeeds.map(([a, b]) => {
      const left = toolList.find((tool) => tool.slug === a)?.name ?? a
      const right = toolList.find((tool) => tool.slug === b)?.name ?? b
      return `- [${left} vs ${right}](${site}/compare/${a}-vs-${b})`
    }),
    '',
    '## Tools',
    `- [All tools](${site}/tools): the catalog, one page at a time. Filter with \`?category=\`.`,
    ...toolList.map((tool) => `- [${tool.name}](${site}/tools/${tool.slug}): ${tool.shortDesc}`),
    '',
    '## Policies',
    `- [About](${site}/about)`,
    `- [How we rate](${site}/how-we-rate)`,
    `- [Affiliate disclosure](${site}/disclosure)`,
    `- [Privacy](${site}/privacy)`,
    `- [Terms](${site}/terms)`,
  ]
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

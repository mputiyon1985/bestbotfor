import { priceLabel, skillLabel } from './format'
import type { CatalogTool } from './catalog-types'

/** Built only from catalog fields. Callers must not render this for non-members. */
export function deepDive(a: CatalogTool, b: CatalogTool): { heading: string; paragraphs: string[] } {
  const aTask = strongestTask(a)
  const bTask = strongestTask(b)
  return {
    heading: `Members' notes: ${a.name} vs ${b.name}`,
    paragraphs: [
      `${a.name} from ${a.vendor} is filed under ${a.category}. ${a.longDesc}`,
      `${b.name} from ${b.vendor} is filed under ${b.category}. ${b.longDesc}`,
      `Pricing on our last review: ${priceLabel(a)} for ${a.name}, and ${priceLabel(b)} for ${b.name}. Confirm both on the vendors' sites before you pay.`,
      `${a.name} is usually a fit for ${skillLabel[a.skillLevel].toLowerCase()} users and runs on ${a.platforms.join(', ')}. ${b.name} is usually a fit for ${skillLabel[b.skillLevel].toLowerCase()} users and runs on ${b.platforms.join(', ')}.`,
      aTask && bTask
        ? `Choose ${a.name} when the job is ${aTask}. Choose ${b.name} when the job is ${bTask}.`
        : `Read each tool's profile for the jobs we scored.`,
    ],
  }
}

function strongestTask(tool: CatalogTool): string | null {
  const top = [...tool.fits].sort((a, b) => b.score - a.score)[0]
  return top?.taskName ?? null
}

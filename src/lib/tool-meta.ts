import { isAnnualBilledSlug } from './annual-billed'
import { priceLabel } from './format'

type ToolMetaInput = {
  slug?: string
  name: string
  vendor: string
  shortDesc: string
  pricingModel: string
  priceFromUsd: number | null
  hasFreeTier: boolean
}

export const TOOL_TITLE_MAX = 60
export const TOOL_DESCRIPTION_MAX = 160

/** Full rendered title (absoluteTitle), built only from catalog fields. */
export function toolMetaTitle(tool: ToolMetaInput): string {
  const free = tool.hasFreeTier || tool.pricingModel === 'free'
  const options = [
    `${tool.name} Review (2026): ${free ? 'Free Plan, ' : ''}Pricing & Alternatives`,
    `${tool.name} Review (2026): Pricing & Alternatives`,
    `${tool.name} Review (2026)`,
    tool.name,
  ]
  return options.find((title) => title.length <= TOOL_TITLE_MAX) ?? tool.name.slice(0, TOOL_TITLE_MAX)
}

function keepsAnnualNote(tool: ToolMetaInput, text: string): boolean {
  return !isAnnualBilledSlug(tool.slug) || /billed annually/i.test(text)
}

export function toolMetaDescription(tool: ToolMetaInput): string {
  const lead = `${tool.name} by ${tool.vendor}: ${tool.shortDesc.trim().replace(/\.?$/, '.')}`
  const price = ` Price: ${priceLabel(tool as Parameters<typeof priceLabel>[0])}.`
  const tail = ' Pros, cons and alternatives.'
  for (const text of [lead + price + tail, lead + price, lead]) {
    if (text.length <= TOOL_DESCRIPTION_MAX && keepsAnnualNote(tool, text)) return text
  }
  // Search snippets drop the price when the lead is long. An annual-list price
  // must not be dropped, or the snippet would hide that the rate is billed annually.
  if (isAnnualBilledSlug(tool.slug) && price.length < TOOL_DESCRIPTION_MAX) {
    const room = TOOL_DESCRIPTION_MAX - price.length
    const trimmed = lead.length <= room ? lead : `${lead.slice(0, Math.max(0, room - 1)).trimEnd()}…`
    const text = `${trimmed}${price}`
    if (text.length <= TOOL_DESCRIPTION_MAX) return text
  }
  return `${lead.slice(0, TOOL_DESCRIPTION_MAX - 1).trimEnd()}…`
}

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

export function toolMetaDescription(tool: ToolMetaInput): string {
  const lead = `${tool.name} by ${tool.vendor}: ${tool.shortDesc.trim().replace(/\.?$/, '.')}`
  const price = ` Price: ${priceLabel(tool as Parameters<typeof priceLabel>[0])}.`
  const tail = ' Pros, cons and alternatives.'
  for (const text of [lead + price + tail, lead + price, lead]) {
    if (text.length <= TOOL_DESCRIPTION_MAX) return text
  }
  return `${lead.slice(0, TOOL_DESCRIPTION_MAX - 1).trimEnd()}…`
}

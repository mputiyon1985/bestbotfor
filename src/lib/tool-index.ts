export type ToolCategory = {
  name: string
  slug: string
  count: number
}

type NamedTool = {
  name: string
  category: string
}

const MAX_CATEGORY_QUERY = 80

/** Lowercase hyphenated category key used in `?category=`. */
export function categorySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function toolCategories<T extends NamedTool>(tools: T[]): ToolCategory[] {
  const counts = new Map<string, { name: string; count: number }>()
  const ordered = [...tools].sort((a, b) => a.name.localeCompare(b.name))
  for (const tool of ordered) {
    const slug = categorySlug(tool.category)
    if (!slug) continue
    const current = counts.get(slug)
    if (current) current.count += 1
    else counts.set(slug, { name: tool.category.trim(), count: 1 })
  }
  return [...counts.entries()]
    .map(([slug, value]) => ({ slug, name: value.name, count: value.count }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function toolsIndexPath(category: ToolCategory | null): string {
  if (!category) return '/tools'
  return `/tools?category=${encodeURIComponent(category.slug)}`
}

export function filterTools<T extends NamedTool>(tools: T[], category: ToolCategory | null): T[] {
  const filtered = category ? tools.filter((tool) => categorySlug(tool.category) === category.slug) : tools
  return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
}

export type ToolsIndexModel<T extends NamedTool> = {
  categories: ToolCategory[]
  selected: ToolCategory | null
  unknown: boolean
  tools: T[]
  path: string
  title: string
  description: string
  noIndex: boolean
  heading: string
  itemListName: string
}

const INDEX_DESCRIPTION =
  'Every AI tool in the BestBotFor catalog, with the vendor, the price, and what the tool is for.'

function descriptionFor(category: ToolCategory | null): string {
  if (!category) return INDEX_DESCRIPTION
  return `${category.name} tools in the BestBotFor catalog, with the vendor, the price, and what each tool is for.`
}

/**
 * Resolve the tools index from the catalog and the raw `category` query value.
 * Unknown values are not echoed back into titles or URLs.
 */
export function toolsIndexModel<T extends NamedTool>(tools: T[], rawCategory: string): ToolsIndexModel<T> {
  const categories = toolCategories(tools)
  const trimmed = rawCategory.trim()
  const rejected = trimmed.length > MAX_CATEGORY_QUERY
  const selected = rejected ? null : matchCategory(categories, trimmed)
  const unknown = trimmed.length > 0 && (rejected || !selected)
  const listed = unknown ? [] : filterTools(tools, selected)
  const heading = selected ? `${selected.name} tools` : 'AI tools'
  return {
    categories,
    selected,
    unknown,
    tools: listed,
    path: selected ? toolsIndexPath(selected) : '/tools',
    title: heading,
    description: descriptionFor(selected),
    noIndex: unknown,
    heading,
    itemListName: selected ? `${selected.name} tools` : 'AI tools in the BestBotFor catalog',
  }
}

function matchCategory(categories: ToolCategory[], raw: string): ToolCategory | null {
  if (!raw) return null
  const slug = categorySlug(raw)
  return (
    categories.find((category) => category.slug === slug || category.name.toLowerCase() === raw.toLowerCase()) ?? null
  )
}

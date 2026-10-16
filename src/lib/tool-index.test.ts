import { describe, expect, it } from 'vitest'
import { categorySlug, filterTools, toolCategories, toolsIndexModel, toolsIndexPath } from './tool-index'

const tools = [
  { slug: 'cursor', name: 'Cursor', category: 'Coding' },
  { slug: 'claude', name: 'Claude', category: 'Chat assistant' },
  { slug: 'chatgpt', name: 'ChatGPT', category: 'Chat assistant' },
  { slug: 'copilot', name: 'GitHub Copilot', category: 'Coding assistant' },
]

describe('categorySlug', () => {
  it('turns a catalog category into a shareable query value', () => {
    expect(categorySlug('Chat assistant')).toBe('chat-assistant')
    expect(categorySlug('AI video')).toBe('ai-video')
    expect(categorySlug('  SEO  ')).toBe('seo')
  })
})

describe('tools index', () => {
  it('lists every category with a count, sorted by name', () => {
    expect(toolCategories(tools)).toEqual([
      { name: 'Chat assistant', slug: 'chat-assistant', count: 2 },
      { name: 'Coding', slug: 'coding', count: 1 },
      { name: 'Coding assistant', slug: 'coding-assistant', count: 1 },
    ])
  })

  it('returns every tool when no category is selected', () => {
    const model = toolsIndexModel(tools, '')
    expect(model.tools.map((tool) => tool.slug)).toEqual(['chatgpt', 'claude', 'cursor', 'copilot'])
    expect(model.selected).toBeNull()
    expect(model.unknown).toBe(false)
    expect(model.path).toBe('/tools')
    expect(model.noIndex).toBe(false)
    expect(model.heading).toBe('AI tools')
    expect(model.description).toContain('Every AI tool')
  })

  it('filters by the category query slug', () => {
    const model = toolsIndexModel(tools, 'chat-assistant')
    expect(model.tools.map((tool) => tool.name)).toEqual(['ChatGPT', 'Claude'])
    expect(model.selected?.name).toBe('Chat assistant')
    expect(model.path).toBe('/tools?category=chat-assistant')
    expect(model.heading).toBe('Chat assistant tools')
    expect(model.title).toBe('Chat assistant tools')
    expect(model.itemListName).toBe('Chat assistant tools')
    expect(model.noIndex).toBe(false)
    expect(toolsIndexPath(model.selected)).toBe('/tools?category=chat-assistant')
  })

  it('accepts the catalog category name as well as its slug', () => {
    const model = toolsIndexModel(tools, 'Chat assistant')
    expect(model.selected?.slug).toBe('chat-assistant')
    expect(model.path).toBe('/tools?category=chat-assistant')
    expect(filterTools(tools, model.selected).map((tool) => tool.slug)).toEqual(['chatgpt', 'claude'])
  })

  it('does not treat an unknown or oversized category as a catalog page', () => {
    const unknown = toolsIndexModel(tools, 'not-a-category')
    expect(unknown.unknown).toBe(true)
    expect(unknown.tools).toEqual([])
    expect(unknown.selected).toBeNull()
    expect(unknown.path).toBe('/tools')
    expect(unknown.noIndex).toBe(true)
    expect(unknown.heading).toBe('AI tools')
    expect(unknown.title).not.toContain('not-a-category')

    const oversized = toolsIndexModel(tools, 'a'.repeat(81))
    expect(oversized.unknown).toBe(true)
    expect(oversized.tools).toEqual([])
    expect(oversized.title).toBe('AI tools')
  })

  it('treats a blank category query as the full catalog', () => {
    const model = toolsIndexModel(tools, '   ')
    expect(model.unknown).toBe(false)
    expect(model.tools).toHaveLength(tools.length)
    expect(model.path).toBe('/tools')
  })
})

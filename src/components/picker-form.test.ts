import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CatalogTask } from '@/lib/catalog-types'
import { PICKER_QUESTIONS, PickerForm } from './picker-form'

const tasks: CatalogTask[] = [
  { slug: 'chat', name: 'Chat', category: 'Write', description: 'Talk' },
  { slug: 'coding', name: 'Write code', category: 'Build', description: 'Code' },
]

function inputTags(html: string, name: string): string[] {
  return html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`, 'g')) ?? []
}

function valueOf(tag: string): string | undefined {
  return /value="([^"]+)"/.exec(tag)?.[1]
}

describe('picker form pills', () => {
  const html = renderToStaticMarkup(createElement(PickerForm, { tasks }))

  it('keeps the budget and skill values the result URL expects', () => {
    const budget = inputTags(html, 'budget')
    const skill = inputTags(html, 'skill')
    expect(budget.map(valueOf)).toEqual(['free', 'low', 'any'])
    expect(skill.map(valueOf)).toEqual(['beginner', 'intermediate', 'pro'])
    for (const tag of [...budget, ...skill]) {
      expect(tag).toContain('type="radio"')
      expect(tag).toContain('required')
    }
    expect(budget.filter((tag) => tag.includes('checked'))).toEqual([expect.stringContaining('value="any"')])
    expect(skill.filter((tag) => tag.includes('checked'))).toEqual([expect.stringContaining('value="beginner"')])
    expect(html).toContain('action="/result"')
    expect(html).toContain('method="get"')
    expect(html).toContain('name="task"')
  })

  it('names each question and lays budget and experience out as pill rows', () => {
    for (const question of PICKER_QUESTIONS) expect(html).toContain(question)
    for (const label of ['Free only', 'Low cost', 'Any budget', 'Beginner', 'Intermediate', 'Advanced']) {
      expect(html).toContain(label)
    }
    const groups = html.match(/<fieldset[\s\S]*?<\/fieldset>/g) ?? []
    expect(groups).toHaveLength(3)
    for (const group of groups.slice(1)) {
      expect(group).toContain('flex-wrap')
      expect(group).toContain('type="radio"')
    }
  })
})

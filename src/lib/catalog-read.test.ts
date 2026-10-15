import { describe, expect, it } from 'vitest'
import { affiliatePrograms, tasks, toolTasks, tools } from './db/schema'
import { readTaskCandidates, readToolPage, searchToolSummaries, TOOLS_PAGE_SIZE } from './catalog-read'
import { createTestDatabase } from '@/test/db'

async function seed(db: Awaited<ReturnType<typeof createTestDatabase>>['db']) {
  await db.insert(tasks).values([
    { slug: 'chat', name: 'Chat and brainstorm', category: 'General', description: 'Talk.' },
    { slug: 'coding', name: 'Write code', category: 'Build', description: 'Code.' },
  ])
  await db.insert(tools).values([
    toolRow(1, 'alpha', 'Alpha'),
    toolRow(2, 'beta', 'Beta'),
    toolRow(3, 'gamma', 'Gamma'),
  ])
  await db.insert(toolTasks).values([
    { toolId: 1, taskId: 1, fitScore: 90, notes: 'Alpha fits chat.' },
    { toolId: 2, taskId: 2, fitScore: 80, notes: 'Beta fits code.' },
  ])
  await db.insert(affiliatePrograms).values({ toolId: 1, hasProgram: false, status: 'none' })
}

function toolRow(id: number, slug: string, name: string) {
  return {
    id,
    slug,
    name,
    vendor: name,
    url: `https://${slug}.example`,
    category: 'Chat',
    shortDesc: `${name} short.`,
    longDesc: `${name} long description.`,
    pricingModel: 'freemium',
    priceFromUsd: 20,
    hasFreeTier: true,
    skillLevel: 'beginner',
    platforms: '["Web"]',
    lastVerifiedAt: '2026-10-15',
    status: 'active',
  }
}

describe('catalog queries', () => {
  it('loads one task with a join and pages the directory', async () => {
    const { db, close } = await createTestDatabase()
    await seed(db)
    const chat = await readTaskCandidates(db, 'chat')
    expect(chat?.tools.map((tool) => tool.slug)).toEqual(['alpha'])
    const coding = await readTaskCandidates(db, 'coding')
    expect(coding?.tools.map((tool) => tool.slug)).toEqual(['beta'])

    const first = await readToolPage(db, 1)
    expect(first.pageSize).toBe(TOOLS_PAGE_SIZE)
    expect(first.tools).toHaveLength(3)
    expect(first.pageCount).toBe(1)

    const plan = await db.$client.execute(
      'EXPLAIN QUERY PLAN SELECT tools.slug FROM tool_tasks INNER JOIN tools ON tools.id = tool_tasks.tool_id WHERE tool_tasks.task_id = 1 AND tools.status = \'active\'',
    )
    const text = plan.rows.map((row) => Object.values(row).join(' ')).join('\n')
    expect(text).toContain('tool_tasks_task_idx')

    const found = await searchToolSummaries(db, 'Write code')
    expect(found.map((tool) => tool.slug)).toEqual(['beta'])
    await close()
  })
})

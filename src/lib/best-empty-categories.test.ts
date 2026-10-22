import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@/lib/sitemap-dates', async (orig) => ({
  ...(await orig<object>()),
  readSitemapDates: () => Promise.reject(new Error('offline')),
}))
vi.mock('@/lib/catalog', async (orig) => ({
  ...(await orig<object>()),
  listPublicSlugs: async () => ({ tasks: ['coding', 'games'], tools: [] }),
  listTaskCandidates: async (slug: string) => ({ task: { slug }, tools: slug === 'games' ? [] : [{ slug: 'cursor' }] }),
}))

const read = (p: string) => readFileSync(p, 'utf8')

describe('empty /best categories', () => {
  it('are left out of the sitemap', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const paths = (await sitemap()).map((entry) => new URL(entry.url).pathname)
    expect(paths).toContain('/best/coding')
    expect(paths).not.toContain('/best/games')
  })

  it('are hidden from the /best index and ItemList, noindex but still render', () => {
    expect(read('src/app/best/page.tsx')).toContain('const listed = rows.filter((row) => row.pick)')
    const page = read('src/app/best/[task]/page.tsx')
    expect(page).toContain('...(empty ? { noIndex: true, follow: true } : {})')
    expect(page).toContain('if (!top) return <EmptyBestPage name={task.name} />')
    expect(page).not.toContain('if (!task || !top) notFound()')
  })
})

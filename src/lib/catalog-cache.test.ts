import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'

const state = vi.hoisted(() => ({ fallbackFile: true }))

vi.mock('./db', () => ({
  getDb: () => {
    throw Object.assign(new Error('SQL read operations are forbidden (BLOCKED)'), { name: 'LibsqlError' })
  },
}))

vi.mock('./catalog-fallback-db', async (importOriginal) => {
  const real = await importOriginal<typeof import('./catalog-fallback-db')>()
  return { ...real, getCatalogFallbackDb: () => (state.fallbackFile ? real.getCatalogFallbackDb() : null) }
})

const fallbackBuilt = existsSync(path.join(process.cwd(), 'data', 'catalog-fallback.db'))

beforeEach(async () => {
  vi.resetModules()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const { resetCatalogFallbackForTests } = await import('./catalog-fallback')
  resetCatalogFallbackForTests()
})
afterEach(() => {
  state.fallbackFile = true
  vi.restoreAllMocks()
})

describe('catalog reads when Turso is down', () => {
  it.skipIf(!fallbackBuilt)('serves tool, task page, directory and search from the seed fallback DB (no 500)', async () => {
    const { getTool, listTaskCandidates, listToolPage, searchCatalog, listTasks } = await import('./catalog')
    expect((await getTool('cursor'))?.slug).toBe('cursor')
    expect((await listTaskCandidates('coding'))?.tools.length).toBeGreaterThan(0)
    expect((await listToolPage(1, null)).tools.length).toBeGreaterThan(0)
    expect((await searchCatalog('cursor')).length).toBeGreaterThan(0)
    expect((await listTasks()).length).toBeGreaterThan(10)
  })

  it('an unknown slug in the fallback is still a 404 (undefined), not an error', async () => {
    const { getTool } = await import('./catalog')
    if (fallbackBuilt) expect(await getTool('no-such-tool-xyz')).toBeUndefined()
  })

  it('without the fallback file, tasks still come from bundled seeds', async () => {
    state.fallbackFile = false
    const { getTask, listTasks } = await import('./catalog')
    expect((await getTask('coding'))?.name).toBe('Write code')
    const tasks = await listTasks()
    expect(tasks.map((t) => t.name)).toEqual([...tasks.map((t) => t.name)].sort())
  })

  it('without the fallback file, a tool read raises CatalogUnavailableError (error boundary), not a 404', async () => {
    state.fallbackFile = false
    const { getTool } = await import('./catalog')
    await expect(getTool('cursor')).rejects.toMatchObject({ name: 'CatalogUnavailableError' })
  })

  it('uses long revalidate windows', async () => {
    const { CATALOG_PAGE_REVALIDATE_SECONDS, CATALOG_REVALIDATE_SECONDS } = await import('./catalog')
    expect(CATALOG_PAGE_REVALIDATE_SECONDS).toBeGreaterThanOrEqual(3600)
    expect(CATALOG_REVALIDATE_SECONDS).toBeGreaterThanOrEqual(6 * 3600)
  })
})

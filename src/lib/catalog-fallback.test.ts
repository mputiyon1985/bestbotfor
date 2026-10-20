import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogUnavailableError, resetCatalogFallbackForTests, withReadFallback } from './catalog-fallback'

afterEach(() => {
  resetCatalogFallbackForTests()
  vi.restoreAllMocks()
})

const blocked = (..._args: unknown[]): Promise<never> => Promise.reject(Object.assign(new Error('SQL read operations are forbidden (BLOCKED) libsql://secret-host'), { name: 'LibsqlError' }))

describe('withReadFallback', () => {
  it('returns the live value and remembers it per arguments', async () => {
    expect(await withReadFallback('t', ['a'], async (slug: string) => `live-${slug}`)).toBe('live-a')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await withReadFallback('t', ['a'], blocked)).toBe('live-a')
  })

  it('does not share last-good values across arguments', async () => {
    await withReadFallback('t', ['a'], async (_s: string) => 'A')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(withReadFallback('t', ['b'], blocked)).rejects.toBeInstanceOf(CatalogUnavailableError)
  })

  it('uses the seed fallback when no last-good value exists', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await withReadFallback('tasks', [], blocked, () => ['seed'])).toEqual(['seed'])
  })

  it('logs only the error class, never the driver message or URL', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await withReadFallback('tasks', [], blocked, () => [])
    const line = log.mock.calls.flat().join(' ')
    expect(line).toContain('LibsqlError')
    expect(line).not.toContain('libsql://')
    expect(line).not.toContain('BLOCKED')
  })

  it('throws a typed error without leaking the cause when nothing is available', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = await withReadFallback('tool', ['x'], blocked).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CatalogUnavailableError)
    expect(String((err as Error).message)).not.toContain('libsql://')
  })

  it('bounds memory at 500 entries (oldest evicted)', async () => {
    for (let i = 0; i < 501; i++) await withReadFallback('q', [i], async (_n: number) => i)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(withReadFallback('q', [0], blocked)).rejects.toBeInstanceOf(CatalogUnavailableError)
    expect(await withReadFallback('q', [500], blocked)).toBe(500)
  })
})

describe('control flow', () => {
  it('rethrows Next notFound() instead of serving a fallback', async () => {
    const { notFound } = await import('next/navigation')
    await expect(withReadFallback('t', [], async () => notFound(), () => 'seed')).rejects.toMatchObject({ digest: expect.stringContaining('404') })
  })
})

describe('fallback values', () => {
  it('are never stored as last-good', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await withReadFallback('f', ['k'], blocked, () => 'from-fallback')).toBe('from-fallback')
    // No live value was ever seen, so with no fallback the read must fail, not replay the fallback.
    await expect(withReadFallback('f', ['k'], blocked)).rejects.toBeInstanceOf(CatalogUnavailableError)
  })

  it('missIsUnavailable turns an empty fallback into CatalogUnavailableError', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(withReadFallback('f', ['m'], blocked, () => null, { missIsUnavailable: true })).rejects.toBeInstanceOf(CatalogUnavailableError)
    expect(await withReadFallback('f', ['n'], blocked, () => null)).toBeNull()
  })

  it('a live miss is still a normal null (404), even with missIsUnavailable', async () => {
    expect(await withReadFallback('f', ['live'], async (_s: string) => null, () => null, { missIsUnavailable: true })).toBeNull()
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { userRatingsEnabled } from './flags'
import { AFFILIATE_LINKS_LIVE, SHOW_USER_AGGREGATE_JSONLD, USER_RATINGS_PRODUCTION_LAUNCH } from './review-flags'

const originalRatings = process.env.USER_RATINGS
const originalVercel = process.env.VERCEL_ENV

afterEach(() => {
  if (originalRatings === undefined) delete process.env.USER_RATINGS
  else process.env.USER_RATINGS = originalRatings
  if (originalVercel === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = originalVercel
})

const environments = ['production', 'preview', 'development', undefined] as const
const offValues = [undefined, '', '   ', 'off', 'OFF', 'false', '0', 'yes', 'ON', 'On'] as const

describe('user ratings flag', () => {
  it('ships the launch, affiliate, and aggregate markup constants off', () => {
    expect(USER_RATINGS_PRODUCTION_LAUNCH).toBe(false)
    expect(AFFILIATE_LINKS_LIVE).toBe(false)
    expect(SHOW_USER_AGGREGATE_JSONLD).toBe(false)
  })

  it('is false in production when USER_RATINGS=on, and true in preview', () => {
    expect(userRatingsEnabled({ userRatings: 'on', vercelEnv: 'production' })).toBe(false)
    expect(userRatingsEnabled({ userRatings: 'on', vercelEnv: 'preview' })).toBe(true)
  })

  it('is false for on, off, and missing across production, preview, development, and an unset env', () => {
    for (const vercelEnv of environments) {
      expect(userRatingsEnabled({ userRatings: 'on', vercelEnv }), `on / ${String(vercelEnv)}`).toBe(vercelEnv !== 'production')
      expect(userRatingsEnabled({ userRatings: 'off', vercelEnv }), `off / ${String(vercelEnv)}`).toBe(false)
      expect(userRatingsEnabled({ userRatings: undefined, vercelEnv }), `missing / ${String(vercelEnv)}`).toBe(false)
    }
  })

  it('treats a missing or empty USER_RATINGS as off everywhere', () => {
    for (const vercelEnv of [...environments, '', ' production ', 'staging', 'Production']) {
      for (const userRatings of offValues) {
        expect(userRatingsEnabled({ userRatings, vercelEnv }), `${String(vercelEnv)} / ${JSON.stringify(userRatings)}`).toBe(false)
      }
      expect(userRatingsEnabled({ userRatings: '', vercelEnv }), `empty / ${String(vercelEnv)}`).toBe(false)
    }
  })

  it('accepts a trimmed "on" outside production and keeps a padded production value off', () => {
    expect(userRatingsEnabled({ userRatings: ' on ', vercelEnv: 'preview' })).toBe(true)
    expect(userRatingsEnabled({ userRatings: 'on\n', vercelEnv: 'development' })).toBe(true)
    expect(userRatingsEnabled({ userRatings: ' on ', vercelEnv: 'production' })).toBe(false)
    expect(userRatingsEnabled({ userRatings: 'on', vercelEnv: ' production ' })).toBe(false)
    expect(userRatingsEnabled({ userRatings: 'on', vercelEnv: '' })).toBe(true)
  })

  it('allows production only when the launch constant is true and USER_RATINGS is on', () => {
    expect(userRatingsEnabled({ userRatings: 'on', vercelEnv: 'production' }, true)).toBe(true)
    expect(userRatingsEnabled({ userRatings: 'off', vercelEnv: 'production' }, true)).toBe(false)
    expect(userRatingsEnabled({ userRatings: undefined, vercelEnv: 'production' }, true)).toBe(false)
    expect(userRatingsEnabled({ userRatings: '', vercelEnv: 'preview' }, true)).toBe(false)
    expect(userRatingsEnabled({ userRatings: 'on', vercelEnv: 'preview' }, false)).toBe(true)
    expect(userRatingsEnabled({ userRatings: 'on', vercelEnv: 'production' }, false)).toBe(false)
    expect(userRatingsEnabled({ userRatings: 'on', vercelEnv: 'production' }, USER_RATINGS_PRODUCTION_LAUNCH)).toBe(false)
  })

  it('reads process.env when called with no arguments', () => {
    delete process.env.USER_RATINGS
    process.env.VERCEL_ENV = 'preview'
    expect(userRatingsEnabled()).toBe(false)

    process.env.USER_RATINGS = ''
    expect(userRatingsEnabled()).toBe(false)

    process.env.USER_RATINGS = 'off'
    process.env.VERCEL_ENV = 'development'
    expect(userRatingsEnabled()).toBe(false)

    process.env.USER_RATINGS = 'on'
    process.env.VERCEL_ENV = 'production'
    expect(userRatingsEnabled()).toBe(false)

    process.env.VERCEL_ENV = 'preview'
    expect(userRatingsEnabled()).toBe(true)

    process.env.VERCEL_ENV = 'development'
    expect(userRatingsEnabled()).toBe(true)

    delete process.env.VERCEL_ENV
    expect(userRatingsEnabled()).toBe(true)

    process.env.USER_RATINGS = 'on'
    process.env.VERCEL_ENV = 'production'
    expect(userRatingsEnabled()).toBe(USER_RATINGS_PRODUCTION_LAUNCH)
    expect(userRatingsEnabled(undefined, true)).toBe(true)
  })

  it('is safe to import from proxy: no Clerk, database, or public ratings env', () => {
    const flags = readFileSync(path.join(process.cwd(), 'src/lib/flags.ts'), 'utf8')
    const constants = readFileSync(path.join(process.cwd(), 'src/lib/review-flags.ts'), 'utf8')
    const proxy = readFileSync(path.join(process.cwd(), 'src/proxy.ts'), 'utf8')
    for (const source of [flags, constants]) {
      expect(source).not.toMatch(/@clerk\/|@libsql\/|drizzle-orm|server-only/)
      expect(source).not.toMatch(/from ['"]@\/lib\/db|from ['"]\.\/db/)
    }
    expect(flags).not.toContain('NEXT_PUBLIC_USER_RATINGS')
    expect(flags).toContain("from './review-flags'")
    expect(constants).toContain('export const USER_RATINGS_PRODUCTION_LAUNCH: boolean = false')
    expect(constants).toContain('export const AFFILIATE_LINKS_LIVE: boolean = false')
    expect(constants).toContain('export const SHOW_USER_AGGREGATE_JSONLD: boolean = false')
    expect(constants).not.toContain('process.env')
    expect(proxy).toContain("from '@/lib/flags'")

    const clientImporters = sourceFiles(path.join(process.cwd(), 'src')).filter((file) => {
      const text = readFileSync(file, 'utf8')
      return text.startsWith("'use client'") || text.startsWith('"use client"')
    })
    for (const file of clientImporters) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toMatch(/lib\/flags['"]/)
    }
  })
})

function sourceFiles(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...sourceFiles(full))
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) found.push(full)
  }
  return found
}

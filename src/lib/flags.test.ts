import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isRatingsPath, userRatingsEnabled, type UserRatingsEnv } from './flags'
import { AFFILIATE_LINKS_LIVE, POLICY_PAGES_LAWYER_APPROVED, SHOW_USER_AGGREGATE_JSONLD, USER_RATINGS_PRODUCTION_LAUNCH } from './review-flags'

const originalRatings = process.env.USER_RATINGS
const originalVercel = process.env.VERCEL_ENV
const originalNode = process.env.NODE_ENV

function setNodeEnv(value: string | undefined) {
  const env = process.env as { NODE_ENV?: string }
  if (value === undefined) delete env.NODE_ENV
  else env.NODE_ENV = value
}

afterEach(() => {
  if (originalRatings === undefined) delete process.env.USER_RATINGS
  else process.env.USER_RATINGS = originalRatings
  if (originalVercel === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = originalVercel
  setNodeEnv(originalNode)
})

const environments = ['production', 'preview', 'development', undefined] as const
const offValues = [undefined, '', '   ', 'off', 'OFF', 'false', '0', 'yes', 'ON', 'On'] as const

describe('user ratings flag', () => {
  it('ships the launch, affiliate, and aggregate markup constants off', () => {
    expect(USER_RATINGS_PRODUCTION_LAUNCH).toBe(false)
    expect(AFFILIATE_LINKS_LIVE).toBe(false)
    expect(SHOW_USER_AGGREGATE_JSONLD).toBe(false)
    expect(POLICY_PAGES_LAWYER_APPROVED).toBe(false)
  })

  it('is on only for preview, development, and test when USER_RATINGS is on', () => {
    for (const vercelEnv of ['preview', 'development', 'test', ' preview ', 'development\n', ' test '] as const) {
      expect(enabled({ userRatings: 'on', vercelEnv }), vercelEnv).toBe(true)
    }
    for (const vercelEnv of ['staging', 'Production', 'prod', 'Preview', 'PREVIEW'] as const) {
      expect(enabled({ userRatings: 'on', vercelEnv }), vercelEnv).toBe(false)
      expect(enabled({ userRatings: 'on', vercelEnv }, true), `launch ${vercelEnv}`).toBe(false)
    }
    expect(enabled({ userRatings: 'on', vercelEnv: 'production' })).toBe(false)
    expect(enabled({ userRatings: 'on', vercelEnv: ' production ' })).toBe(false)
  })

  it('is off when VERCEL_ENV is unset, even if NODE_ENV is not production', () => {
    for (const vercelEnv of [undefined, '', '   '] as const) {
      expect(enabled({ userRatings: 'on', vercelEnv }), `unset ${JSON.stringify(vercelEnv)}`).toBe(false)
      expect(enabled({ userRatings: 'on', vercelEnv }, true), `launch unset ${JSON.stringify(vercelEnv)}`).toBe(false)
    }

    process.env.USER_RATINGS = 'on'
    delete process.env.VERCEL_ENV
    for (const nodeEnv of [undefined, 'development', 'test', 'production'] as const) {
      setNodeEnv(nodeEnv)
      expect(userRatingsEnabled(), `NODE_ENV ${String(nodeEnv)}`).toBe(false)
    }
  })

  it('treats a missing or empty USER_RATINGS as off everywhere', () => {
    const vercelValues = [...environments, '', ' production ', 'staging', 'Production', 'preview', 'test'] as const
    for (const vercelEnv of vercelValues) {
      for (const userRatings of offValues) {
        expect(enabled({ userRatings, vercelEnv }), `${String(vercelEnv)} / ${JSON.stringify(userRatings)}`).toBe(false)
        expect(enabled({ userRatings, vercelEnv }, true), `launch ${String(vercelEnv)}`).toBe(false)
      }
    }
  })

  it('accepts a trimmed "on" on the allowlist and keeps a padded production value off', () => {
    expect(enabled({ userRatings: ' on ', vercelEnv: 'preview' })).toBe(true)
    expect(enabled({ userRatings: 'on\n', vercelEnv: 'development' })).toBe(true)
    expect(enabled({ userRatings: 'on', vercelEnv: 'test' })).toBe(true)
    expect(enabled({ userRatings: ' on ', vercelEnv: 'production' })).toBe(false)
    expect(enabled({ userRatings: 'on', vercelEnv: ' production ' })).toBe(false)
    expect(enabled({ userRatings: 'on', vercelEnv: '' })).toBe(false)
    expect(enabled({ userRatings: 'on' })).toBe(false)
  })

  it('allows production only when the launch constant is true and USER_RATINGS is on', () => {
    expect(enabled({ userRatings: 'on', vercelEnv: 'production' }, true)).toBe(true)
    expect(enabled({ userRatings: 'off', vercelEnv: 'production' }, true)).toBe(false)
    expect(enabled({ userRatings: undefined, vercelEnv: 'production' }, true)).toBe(false)
    expect(enabled({ userRatings: '', vercelEnv: 'preview' }, true)).toBe(false)
    expect(enabled({ userRatings: 'on', vercelEnv: 'preview' }, false)).toBe(true)
    expect(enabled({ userRatings: 'on', vercelEnv: 'production' }, false)).toBe(false)
    expect(enabled({ userRatings: 'on', vercelEnv: 'production' }, USER_RATINGS_PRODUCTION_LAUNCH)).toBe(false)
    expect(enabled({ userRatings: 'on', vercelEnv: 'staging' }, true)).toBe(false)
    expect(enabled({ userRatings: 'on', vercelEnv: '' }, true)).toBe(false)
    expect(enabled({ userRatings: 'on' }, true)).toBe(false)
  })

  it('reads process.env when called with no arguments', () => {
    delete process.env.USER_RATINGS
    process.env.VERCEL_ENV = 'preview'
    setNodeEnv('production')
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
    setNodeEnv('production')
    expect(userRatingsEnabled()).toBe(true)

    process.env.VERCEL_ENV = 'development'
    expect(userRatingsEnabled()).toBe(true)

    process.env.VERCEL_ENV = 'test'
    expect(userRatingsEnabled()).toBe(true)

    process.env.VERCEL_ENV = 'staging'
    expect(userRatingsEnabled()).toBe(false)

    delete process.env.VERCEL_ENV
    setNodeEnv('test')
    expect(userRatingsEnabled()).toBe(false)

    process.env.USER_RATINGS = 'on'
    process.env.VERCEL_ENV = 'production'
    expect(userRatingsEnabled()).toBe(USER_RATINGS_PRODUCTION_LAUNCH)
    expect(userRatingsEnabled(undefined, true)).toBe(true)
  })

  it('recognizes the ratings paths and ignores the rest of the site', () => {
    const hidden = [
      '/tools/chatgpt/rate',
      '/tools/a/rate/',
      '/api/tools/chatgpt/reviews',
      '/api/tools/chatgpt/reviews/',
      '/admin',
      '/admin/',
      '/admin/reviews',
      '/admin/reports',
      '/admin/audit',
      '/admin/vendor-domains',
      '/admin/sponsor-links',
      '/review-guidelines',
      '/how-user-ratings-work',
      '/members/reviews',
      '/Tools/ChatGPT/Rate',
      '/TOOLS/CHATGPT/RATE/',
      '/tools/chatgpt/%72ate',
      '/tools/%43hatgpt/rate',
      '/Admin/Reviews',
      '/api/tools/ChatGPT/Reviews',
      '/api/tools/chatgpt/%72eviews',
    ]
    for (const path of hidden) expect(isRatingsPath(path), path).toBe(true)

    const visible = [
      '/',
      '/tools/chatgpt',
      '/tools/chatgpt/rate/extra',
      '/tools/rate',
      '/api/tools/chatgpt',
      '/api/tools/chatgpt/reviews/extra',
      '/api/tools/reviews',
      '/members',
      '/members/reviews/1',
      '/admin/other',
      '/review-guidelines/extra',
      '/how-user-ratings-work/extra',
      '/tools/chatgpt/rate?x=1',
    ]
    for (const path of visible) expect(isRatingsPath(path), path).toBe(false)
  })

  it('decodes then lowercases a ratings path, and leaves a bad encoding unchanged', () => {
    expect(isRatingsPath('/TOOLS/%43hatGPT/%72ate')).toBe(true)
    expect(() => isRatingsPath('/%')).not.toThrow()
    expect(isRatingsPath('/%')).toBe(false)
    expect(isRatingsPath('/tools/chatgpt/%E0%A4%A')).toBe(false)
    expect(isRatingsPath('/tools/chatgpt/%2572ate')).toBe(false)
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
    expect(flags).not.toContain('NODE_ENV')
    expect(flags).toContain("from './review-flags'")
    expect(constants).toContain('export const USER_RATINGS_PRODUCTION_LAUNCH: boolean = false')
    expect(constants).toContain('export const AFFILIATE_LINKS_LIVE: boolean = false')
    expect(constants).toContain('export const SHOW_USER_AGGREGATE_JSONLD: boolean = false')
    expect(constants).toContain('export const POLICY_PAGES_LAWYER_APPROVED: boolean = false')
    expect(constants).not.toContain('process.env')
    expect(proxy).toContain("from '@/lib/flags'")
    expect(proxy).toContain('userRatingsEnabled()')
    expect(proxy).toContain('isRatingsPath(')

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

function enabled(env: UserRatingsEnv, productionLaunch?: boolean): boolean {
  return productionLaunch === undefined ? userRatingsEnabled(env) : userRatingsEnabled(env, productionLaunch)
}

function sourceFiles(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...sourceFiles(full))
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) found.push(full)
  }
  return found
}

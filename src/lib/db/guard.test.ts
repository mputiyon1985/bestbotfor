import { describe, expect, it } from 'vitest'
import { checkDbTarget, dbHost, isProdHost } from './guard'

const cfg = {
  prodHosts: ['prod-db-acme.aws-us-east-1.turso.io'],
  prodDbNames: ['bestbotfor'],
  nonProductionAllowedHosts: ['bestbotfor-preview-test-acme.aws-us-east-1.turso.io'],
}
const PROD = 'libsql://prod-db-acme.aws-us-east-1.turso.io'
const PROD_BY_NAME = 'libsql://bestbotfor-acme.aws-us-east-1.turso.io'
const TEST = 'libsql://bestbotfor-preview-test-acme.aws-us-east-1.turso.io'

describe('db guard', () => {
  it('extracts hosts', () => {
    expect(dbHost('file:./data/local.db')).toBeNull()
    expect(dbHost(PROD)).toBe('prod-db-acme.aws-us-east-1.turso.io')
  })
  it('allows prod only in production', () => {
    expect(checkDbTarget(PROD, 'production', cfg).ok).toBe(true)
    for (const env of ['preview', 'development', undefined]) {
      const r = checkDbTarget(PROD, env, cfg)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toMatch(/Refusing/)
    }
  })
  it('detects prod by DB name', () => {
    expect(checkDbTarget(PROD_BY_NAME, 'preview', cfg).ok).toBe(false)
    expect(checkDbTarget(PROD_BY_NAME, 'production', cfg).ok).toBe(true)
  })
  it('allows the preview test DB in previews', () => {
    expect(checkDbTarget(TEST, 'preview', cfg)).toEqual({ ok: true, host: 'bestbotfor-preview-test-acme.aws-us-east-1.turso.io' })
  })
  it('refuses unknown remote hosts in previews', () => {
    expect(checkDbTarget('libsql://other-acme.turso.io', 'preview', cfg).ok).toBe(false)
  })
  it('allows local files anywhere', () => {
    expect(checkDbTarget('file:./data/local.db', 'preview', cfg).ok).toBe(true)
  })
})

describe('db guard against config/db-guard.json', () => {
  // Uses the real config (default argument), not the fixture above.
  const PREVIEW = 'libsql://bestbotfor-preview-test-mputiyon1985.aws-us-east-1.turso.io'
  const PROD_REAL = 'libsql://bestbotfor-mputiyon1985.aws-us-east-1.turso.io'

  it('fails closed when VERCEL_ENV is unset or empty', () => {
    for (const env of [undefined, '', '  ']) {
      expect(checkDbTarget(PROD_REAL, env).ok).toBe(false)
      expect(checkDbTarget('libsql://unknown-acme.aws-us-east-1.turso.io', env).ok).toBe(false)
      expect(checkDbTarget('https://example.com', env).ok).toBe(false)
      expect(checkDbTarget(PREVIEW, env).ok).toBe(true)
      expect(checkDbTarget('file:./data/local.db', env).ok).toBe(true)
      expect(checkDbTarget('file:data/e2e.db', env).ok).toBe(true)
    }
  })
  it('allows prod only for VERCEL_ENV=production', () => {
    expect(checkDbTarget(PROD_REAL, 'production').ok).toBe(true)
    expect(checkDbTarget(PROD_REAL, 'preview').ok).toBe(false)
    expect(checkDbTarget(PROD_REAL, 'development').ok).toBe(false)
  })
  it('classifies the agentic Turso host as prod and refuses it outside production', () => {
    const host = 'agentic-ai-co-mputiyon1985.aws-us-east-1.turso.io'
    const url = `libsql://${host}`
    expect(dbHost(url)).toBe(host)
    expect(isProdHost(host)).toBe(true)
    expect(checkDbTarget(url, 'production')).toEqual({ ok: true, host })
    for (const env of [undefined, '', '  ', 'preview', 'development']) {
      const result = checkDbTarget(url, env)
      expect(result.ok, String(env)).toBe(false)
      if (!result.ok) {
        expect(result.host).toBe(host)
        expect(result.reason).toMatch(/Refusing to migrate\/seed production DB host/)
      }
    }
  })
  it('decodes %2d/%2e-encoded hosts like @libsql/core and treats them as prod', () => {
    const encoded = [
      'libsql://bestbotfor%2dmputiyon1985.aws-us-east-1.turso.io',
      'libsql://bestbotfor%2Dmputiyon1985%2eaws-us-east-1%2Eturso%2eio',
      'libsql://%62estbotfor-mputiyon1985.aws-us-east-1.turso.io',
      'libsql://BESTBOTFOR-Mputiyon1985.AWS-US-EAST-1.TURSO.IO',
    ]
    for (const url of encoded) {
      expect(dbHost(url)).toBe('bestbotfor-mputiyon1985.aws-us-east-1.turso.io')
      for (const env of [undefined, '', 'preview', 'development']) {
        const r = checkDbTarget(url, env)
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toMatch(/production DB host/)
      }
    }
  })
  it('strips trailing dots before classifying', () => {
    expect(dbHost(`${PROD_REAL}.`)).toBe('bestbotfor-mputiyon1985.aws-us-east-1.turso.io')
    expect(checkDbTarget(`${PROD_REAL}.`, 'preview').ok).toBe(false)
    expect(checkDbTarget(`${PROD_REAL}..:443`, undefined).ok).toBe(false)
    expect(checkDbTarget('libsql://bestbotfor-mputiyon1985.aws-us-east-1.turso.io%2e', 'preview').ok).toBe(false)
    expect(checkDbTarget(`${PREVIEW}.`, 'preview').ok).toBe(true)
  })
  it('refuses unparseable or badly encoded URLs outside production', () => {
    expect(checkDbTarget('libsql://bad%zzhost.turso.io', undefined).ok).toBe(false)
    expect(checkDbTarget('not a url', 'preview').ok).toBe(false)
  })
})

describe('applyMigrations guard', () => {
  it('throws before connecting to a prod host outside production', async () => {
    const { applyMigrations } = await import('./migrate')
    const prev = process.env.VERCEL_ENV
    delete process.env.VERCEL_ENV
    try {
      await expect(applyMigrations('libsql://bestbotfor%2dmputiyon1985.aws-us-east-1.turso.io', 'x')).rejects.toThrow(/DB guard/)
    } finally {
      if (prev !== undefined) process.env.VERCEL_ENV = prev
    }
  })
})

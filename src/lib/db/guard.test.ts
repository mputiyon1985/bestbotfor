import { describe, expect, it } from 'vitest'
import { checkDbTarget, dbHost } from './guard'

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

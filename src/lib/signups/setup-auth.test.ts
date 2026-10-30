import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('setup-auth', () => {
  it('writes a private file and prints only its path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'auth-setup-'))
    const out = join(dir, '.auth-setup.local')
    const result = spawnSync('node_modules/.bin/tsx', ['scripts/setup-signups-auth.ts'], {
      env: { ...process.env, AUTH_SETUP_FILE: out },
      encoding: 'utf8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(out)

    const file = readFileSync(out, 'utf8')
    const session = file.match(/^SIGNUPS_SESSION_SECRET=(.+)$/m)?.[1] ?? ''
    const totp = file.match(/^SIGNUPS_TOTP_SECRET=(.+)$/m)?.[1] ?? ''
    const hash = file.match(/^SIGNUPS_ADMIN_PASSWORD_HASH=(.+)$/m)?.[1] ?? ''
    const password = result.stderr.match(/^Password: (.+)$/m)?.[1] ?? ''
    expect(session.length).toBeGreaterThan(20)
    expect(password.length).toBeGreaterThan(10)
    expect(totp.length).toBeGreaterThan(10)
    expect(hash.startsWith('scrypt:')).toBe(true)
    expect(file).not.toContain('PASSWORD=')
    expect(file).not.toContain(password)
    expect(file).toContain('plaintext password is not in this file')
    expect(result.stderr).toContain('Delete')
    expect(file).toContain('otpauth://totp/Signups:mark?')
    expect(result.stdout.includes(session)).toBe(false)
    expect(result.stdout.includes(password)).toBe(false)
    expect(result.stdout.includes(totp)).toBe(false)
    expect(result.stdout.includes(hash)).toBe(false)
    expect(result.stdout.includes('otpauth://')).toBe(false)
    expect(result.stderr.includes(session)).toBe(false)
    expect(result.stderr.includes(totp)).toBe(false)
    expect((statSync(out).mode & 0o777) === 0o600).toBe(true)

    const png = readFileSync(`${out}.png`)
    expect((statSync(`${out}.png`).mode & 0o777) === 0o600).toBe(true)
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  }, 30_000)
})

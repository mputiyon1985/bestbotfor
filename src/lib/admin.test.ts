import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { adminGuardGaps } from '../../scripts/check-member-routes'
import { isAdminPath } from './admin-path'
import { adminAllowlist, decideAdminAccess, decideAdminStepUp, type AdminPrincipal } from './admin'

const allow = adminAllowlist('user_admin')

function principal(overrides: Partial<AdminPrincipal>): AdminPrincipal {
  return {
    userId: 'user_admin',
    role: 'admin',
    twoFactorEnabled: true,
    factorVerificationAge: [1, 2],
    ...overrides,
  }
}

describe('admin access', () => {
  it('404s signed-out, normal, and role-only users, and sends an admin without MFA to setup', () => {
    expect(decideAdminAccess(principal({ userId: null }), allow).ok).toBe(false)
    expect(decideAdminAccess(principal({ userId: null }), allow)).toEqual({ ok: false, reason: 'signed-out' })
    expect(decideAdminAccess(principal({ userId: 'user_member', role: null }), allow)).toEqual({ ok: false, reason: 'not-admin' })
    expect(decideAdminAccess(principal({ userId: 'user_role_only', role: 'admin' }), allow)).toEqual({ ok: false, reason: 'not-admin' })
    expect(decideAdminAccess(principal({ userId: 'user_admin', role: 'member' }), allow)).toEqual({ ok: false, reason: 'not-admin' })
    expect(decideAdminAccess(principal({ twoFactorEnabled: false, factorVerificationAge: [1, -1] }), allow)).toEqual({
      ok: false,
      reason: 'mfa-required',
    })
    expect(decideAdminAccess(principal({ factorVerificationAge: [1, -1] }), allow)).toEqual({ ok: false, reason: 'mfa-required' })
    expect(decideAdminAccess(principal({ factorVerificationAge: [4, 30] }), allow)).toEqual({ ok: true, userId: 'user_admin' })
  })

  it('asks for a fresh strict_mfa check and does not accept a missing second factor', () => {
    expect(decideAdminStepUp(principal({ factorVerificationAge: [1, 2] }), allow)).toEqual({ ok: true, userId: 'user_admin' })
    expect(decideAdminStepUp(principal({ factorVerificationAge: [1, 9] }), allow)).toEqual({ ok: true, userId: 'user_admin' })
    expect(decideAdminStepUp(principal({ factorVerificationAge: [1, 10] }), allow)).toEqual({ ok: false, reason: 'reverification' })
    expect(decideAdminStepUp(principal({ factorVerificationAge: [11, 1] }), allow)).toEqual({ ok: false, reason: 'reverification' })
    expect(decideAdminStepUp(principal({ factorVerificationAge: [1, -1] }), allow)).toEqual({ ok: false, reason: 'mfa-required' })
    expect(decideAdminStepUp(principal({ factorVerificationAge: null }), allow)).toEqual({ ok: false, reason: 'mfa-required' })
    expect(decideAdminStepUp(principal({ userId: null }), allow)).toEqual({ ok: false, reason: 'signed-out' })
  })

  it('ignores blank allowlist entries and keeps the list server-only', () => {
    expect([...adminAllowlist(' user_a, ,user_b ')]).toEqual(['user_a', 'user_b'])
    expect(adminAllowlist(undefined).size).toBe(0)
    const source = readFileSync(path.join(process.cwd(), 'src/lib/admin.ts'), 'utf8')
    expect(source).toContain('ADMIN_CLERK_USER_IDS')
    expect(source).not.toContain('NEXT_PUBLIC_ADMIN_CLERK_USER_IDS')
    const clientFiles = ['src/components/admin-step-up-button.tsx', 'src/components/consent-banner.tsx']
    for (const file of clientFiles) {
      const text = readFileSync(path.join(process.cwd(), file), 'utf8')
      expect(text, file).not.toContain("from '@/lib/admin'")
    }
  })

  it('fails the admin guard check on an unguarded file', () => {
    expect(adminGuardGaps([{ path: 'src/app/admin/unguarded.tsx', text: 'export default function Page() { return null }' }])).toEqual([
      'src/app/admin/unguarded.tsx must call requireAdmin(), requireAdminStepUp(), assertAdminArea(), or requireMfaSetupPage().',
    ])
    expect(adminGuardGaps([{ path: 'src/app/admin/page.tsx', text: 'await requireAdmin()' }])).toEqual([])
  })

  it('treats only /admin as an admin path', () => {
    expect(isAdminPath('/admin')).toBe(true)
    expect(isAdminPath('/admin/mfa-required')).toBe(true)
    expect(isAdminPath('/administrator')).toBe(false)
    expect(isAdminPath('/tools/chatgpt')).toBe(false)
  })
})

import { notFound, redirect } from 'next/navigation'
import { reverificationError } from '@clerk/nextjs/server'
import { isClerkConfigured } from './flags'

/**
 * Clerk `strict_mfa` is multi-factor within 10 minutes.
 * If the second factor age is -1, Clerk treats that as "no second factor" and
 * accepts a fresh first factor. This guard does not. Enrollment is checked
 * separately, and step-up still requires both factors inside the window.
 */
export const ADMIN_STEP_UP_MINUTES = 10

export type AdminPrincipal = {
  userId: string | null
  role: string | null
  twoFactorEnabled: boolean
  /** Minutes since the first and second factors. -1 means that factor did not run. */
  factorVerificationAge: [number, number] | null
}

export type AdminDecision =
  | { ok: true; userId: string }
  | { ok: false; reason: 'signed-out' | 'not-admin' | 'mfa-required' }

export type StepUpDecision = AdminDecision | { ok: false; reason: 'reverification' }

/** Comma-separated Clerk user ids. Server-only. Blank entries are ignored. */
export function adminAllowlist(raw: string | undefined = process.env.ADMIN_CLERK_USER_IDS): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const part of raw?.split(',') ?? []) {
    const id = part.trim()
    if (id) ids.add(id)
  }
  return ids
}

/**
 * Signed-out, a normal member, and a role-only (not allowlisted) user are not admins.
 * An allowlisted admin without an enrolled second factor, or whose session never
 * completed one, may only see the MFA setup page.
 */
export function decideAdminAccess(principal: AdminPrincipal, allowlist: ReadonlySet<string>): AdminDecision {
  if (!principal.userId) return { ok: false, reason: 'signed-out' }
  if (principal.role !== 'admin' || !allowlist.has(principal.userId)) return { ok: false, reason: 'not-admin' }
  const secondFactorAge = principal.factorVerificationAge?.[1]
  const sessionUsedSecondFactor = typeof secondFactorAge === 'number' && secondFactorAge >= 0
  if (!principal.twoFactorEnabled || !sessionUsedSecondFactor) return { ok: false, reason: 'mfa-required' }
  return { ok: true, userId: principal.userId }
}

/** Both factors must be newer than the strict_mfa window. A missing second factor does not fall back. */
export function strictMfaFresh(age: [number, number] | null, afterMinutes = ADMIN_STEP_UP_MINUTES): boolean {
  if (!age) return false
  const [first, second] = age
  if (!Number.isFinite(first) || !Number.isFinite(second)) return false
  if (first < 0 || second < 0) return false
  return afterMinutes > first && afterMinutes > second
}

export function decideAdminStepUp(principal: AdminPrincipal, allowlist: ReadonlySet<string>): StepUpDecision {
  const access = decideAdminAccess(principal, allowlist)
  if (!access.ok) return access
  if (!strictMfaFresh(principal.factorVerificationAge)) return { ok: false, reason: 'reverification' }
  return access
}

async function readAdminPrincipal(): Promise<AdminPrincipal> {
  if (!isClerkConfigured()) {
    return { userId: null, role: null, twoFactorEnabled: false, factorVerificationAge: null }
  }
  const { auth, currentUser } = await import('@clerk/nextjs/server')
  const session = await auth()
  if (!session.userId) {
    return { userId: null, role: null, twoFactorEnabled: false, factorVerificationAge: null }
  }
  const user = await currentUser()
  const role = user?.publicMetadata && typeof user.publicMetadata.role === 'string' ? user.publicMetadata.role : null
  const fva = session.sessionClaims?.fva
  const factorVerificationAge =
    Array.isArray(fva) && fva.length >= 2 && typeof fva[0] === 'number' && typeof fva[1] === 'number'
      ? ([fva[0], fva[1]] as [number, number])
      : null
  return {
    userId: session.userId,
    role,
    twoFactorEnabled: user?.twoFactorEnabled === true,
    factorVerificationAge,
  }
}

/** 404 for everyone except an allowlisted admin whose session already used a second factor. */
export async function requireAdmin(): Promise<{ userId: string }> {
  const decision = decideAdminAccess(await readAdminPrincipal(), adminAllowlist())
  if (!decision.ok) {
    if (decision.reason === 'mfa-required') redirect('/admin/mfa-required')
    notFound()
  }
  return { userId: decision.userId }
}

/**
 * Layout gate. Signed-out and non-admins 404. An admin who still needs MFA
 * is allowed through so the setup page can render. Call before any data read.
 */
export async function assertAdminArea(): Promise<void> {
  const decision = decideAdminAccess(await readAdminPrincipal(), adminAllowlist())
  if (!decision.ok && decision.reason !== 'mfa-required') notFound()
}

/** Setup page. Anyone else 404s. An admin who already satisfies the guard goes back to /admin. */
export async function requireMfaSetupPage(): Promise<void> {
  const decision = decideAdminAccess(await readAdminPrincipal(), adminAllowlist())
  if (decision.ok) redirect('/admin')
  if (decision.reason !== 'mfa-required') notFound()
}

/**
 * Destructive admin actions. Refuses before any write.
 * A stale or missing second factor returns Clerk's reverification error so
 * useReverification() can prompt and retry. Other failures 404.
 */
export async function requireAdminStepUp(): Promise<{ userId: string } | ReturnType<typeof reverificationError>> {
  const decision = decideAdminStepUp(await readAdminPrincipal(), adminAllowlist())
  if (!decision.ok) {
    if (decision.reason === 'reverification') return reverificationError('strict_mfa')
    notFound()
  }
  return { userId: decision.userId }
}

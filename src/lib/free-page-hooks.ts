import type { FreePageOverrides } from './free-page'
import { parseCheckedAt } from './free-plan'

/** Request headers the free-page e2e project uses to pin the clock or drop a note. */
export const FREE_PLAN_NOW_HEADER = 'x-bbf-e2e-free-plan-now'
export const FREE_PLAN_DROP_HEADER = 'x-bbf-e2e-free-plan-drop'

/**
 * Honored only when BBF_E2E_HOOKS is exactly "1" and the process is not on
 * Vercel or production. The boot validator (review-hmac-secrets.ts) already
 * refuses BBF_E2E_HOOKS=1 with VERCEL=1 or VERCEL_ENV=production.
 */
export function freePageHooksEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.BBF_E2E_HOOKS === '1' && env.VERCEL !== '1' && env.VERCEL_ENV !== 'production'
}

export function freePageClock(
  read: (name: string) => string | null,
  realNow: number,
  env: Readonly<Record<string, string | undefined>> = process.env,
): { now: number; overrides: FreePageOverrides } {
  if (!freePageHooksEnabled(env)) return { now: realNow, overrides: {} }
  const pinned = parseCheckedAt(read(FREE_PLAN_NOW_HEADER))
  const drop = (read(FREE_PLAN_DROP_HEADER) ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)
  return { now: pinned ?? realNow, overrides: drop.length ? { drop } : {} }
}

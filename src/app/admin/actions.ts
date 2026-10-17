'use server'

import { requireAdminStepUp } from '@/lib/admin'

/** Sensitive admin actions call this. A stale second factor asks the client to reverify. */
export async function adminStepUpProbe() {
  const access = await requireAdminStepUp()
  if ('clerk_error' in access) return access
  return { ok: true as const }
}

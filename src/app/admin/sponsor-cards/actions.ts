'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminStepUp } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { recordSponsorCardReview } from '@/lib/sponsor-card'

/** Approves or rejects one pending tool card. A stale second factor asks the client to reverify. */
export async function reviewSponsorCardAction(formData: FormData) {
  const access = await requireAdminStepUp()
  if ('clerk_error' in access) return access
  const decision = formData.get('decision')
  if (decision !== 'approved' && decision !== 'rejected') {
    return { ok: false as const, message: 'That tool card is not waiting for review.' }
  }
  const creativeId = Number(formData.get('creative_id'))
  if (!Number.isInteger(creativeId) || creativeId < 1) {
    return { ok: false as const, message: 'That tool card is not waiting for review.' }
  }
  const result = await recordSponsorCardReview(getDb(), {
    actorId: access.userId,
    creativeId,
    decision,
    reason: String(formData.get('reason') ?? ''),
    now: Date.now(),
  })
  if (result.ok) revalidatePath('/admin/sponsor-cards')
  return result
}

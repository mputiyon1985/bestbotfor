'use server'

import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { requireAdminStepUp } from '@/lib/admin'
import { getDb } from '@/lib/db'
import { adminSponsorsEnabled } from '@/lib/flags'
import { markSponsorRefunded, recordSponsorCardReview } from '@/lib/sponsor-card'

/** Approves or rejects one pending tool card. A stale second factor asks the client to reverify. */
export async function reviewSponsorCardAction(formData: FormData) {
  if (!adminSponsorsEnabled()) notFound()
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
  const version = Number(formData.get('version'))
  const updatedAt = Number(formData.get('updated_at'))
  const contentHash = String(formData.get('content_hash') ?? '')
  if (!Number.isInteger(version) || version < 1 || !Number.isInteger(updatedAt) || !/^[a-f0-9]{64}$/.test(contentHash)) {
    return { ok: false as const, message: 'That tool card changed since you opened it. Refresh and review the current version.' }
  }
  const result = await recordSponsorCardReview(getDb(), {
    actorId: access.userId,
    creativeId,
    decision,
    reason: String(formData.get('reason') ?? ''),
    now: Date.now(),
    version,
    updatedAt,
    contentHash,
  })
  if (result.ok) revalidatePath('/admin/sponsors')
  return result
}

/** Records that the admin refunded this card in the Stripe dashboard. Does not call Stripe. */
export async function markSponsorRefundedAction(formData: FormData) {
  if (!adminSponsorsEnabled()) notFound()
  const access = await requireAdminStepUp()
  if ('clerk_error' in access) return access
  const creativeId = Number(formData.get('creative_id'))
  if (!Number.isInteger(creativeId) || creativeId < 1) {
    return { ok: false as const, message: 'That card is not waiting for a refund.' }
  }
  const result = await markSponsorRefunded(getDb(), {
    actorId: access.userId,
    creativeId,
    reason: String(formData.get('reason') ?? ''),
    now: Date.now(),
  })
  if (result.ok) revalidatePath('/admin/sponsors')
  return result
}

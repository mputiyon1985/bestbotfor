import Link from 'next/link'
import { AdminStepUpButton } from '@/components/admin-step-up-button'
import { requireAdmin } from '@/lib/admin'
import { adminSponsorsEnabled } from '@/lib/flags'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  await requireAdmin()
  return (
    <article className="max-w-2xl space-y-4">
      <h1 className="font-bold text-5xl">Admin</h1>
      <p>This area is limited to allowlisted admins whose session used a second factor.</p>
      <p>Moderation and reports are not on this page yet.</p>
      {adminSponsorsEnabled() ? (
        <p>
          <Link href="/admin/sponsors" className="underline">
            Review sponsor tool cards
          </Link>
        </p>
      ) : null}
      <AdminStepUpButton />
    </article>
  )
}

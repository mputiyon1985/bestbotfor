import { AdminStepUpButton } from '@/components/admin-step-up-button'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  await requireAdmin()
  return (
    <article className="max-w-2xl space-y-4">
      <h1 className="font-bold text-5xl">Admin</h1>
      <p>This area is limited to allowlisted admins whose session used a second factor.</p>
      <p>Moderation, reports, and sponsor tools are not on this page yet.</p>
      <AdminStepUpButton />
    </article>
  )
}

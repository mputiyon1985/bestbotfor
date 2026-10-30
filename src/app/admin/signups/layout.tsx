import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { requireSignupsSession } from '@/lib/signups/access'
import { ROBOTS_METADATA } from '@/lib/signups/privacy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const metadata: Metadata = {
  title: 'Signups',
  robots: ROBOTS_METADATA,
  alternates: { canonical: '/admin/signups' },
}

export default async function SignupsLayout({ children }: { children: ReactNode }) {
  const access = await requireSignupsSession()
  if (!access.configured) notFound()
  return children
}

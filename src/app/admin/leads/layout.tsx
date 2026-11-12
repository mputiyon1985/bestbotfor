import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { requireLeadsSession } from '@/lib/leads/access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const metadata: Metadata = {
  title: 'Leads',
  robots: { index: false, follow: false },
}

export default async function LeadsLayout({ children }: { children: ReactNode }) {
  const access = await requireLeadsSession()
  if (!access.configured) notFound()
  return children
}

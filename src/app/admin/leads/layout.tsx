import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { requireLeadsSession } from '@/lib/leads/access'
import { LEADS_LOGIN, LEADS_PATH_HEADER, LEADS_REQUEST_HEADER, isLeadsLoginPath, leadsRequestAuthorized } from '@/lib/leads/paths'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const metadata: Metadata = {
  title: 'Leads',
  robots: { index: false, follow: false },
}

export default async function LeadsLayout({ children }: { children: ReactNode }) {
  const access = await requireLeadsSession()
  if (!access.configured) notFound()
  const headerStore = await headers()
  const path = headerStore.get(LEADS_PATH_HEADER) ?? ''
  const proof = headerStore.get(LEADS_REQUEST_HEADER)
  const login = leadsRequestAuthorized(path, proof) && isLeadsLoginPath(path)
  if (!login && !access.session) redirect(LEADS_LOGIN)
  return children
}

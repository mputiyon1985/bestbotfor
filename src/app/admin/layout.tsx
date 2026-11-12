import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { assertAdminArea } from '@/lib/admin'
import { LEADS_REQUEST_HEADER } from '@/lib/leads/paths'
import { SIGNUPS_REQUEST_HEADER } from '@/lib/signups/paths'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Password-gated admin sections set their own request headers. The proxy
  // strips a client-supplied copy and sets each header only for that section.
  const headerStore = await headers()
  const ownSession = headerStore.get(SIGNUPS_REQUEST_HEADER) === '1' || headerStore.get(LEADS_REQUEST_HEADER) === '1'
  if (!ownSession) await assertAdminArea()
  return children
}

import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { assertAdminArea } from '@/lib/admin'
import { SIGNUPS_REQUEST_HEADER } from '@/lib/signups/paths'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // /admin/signups uses its own password and authenticator session. The proxy
  // strips a client-supplied copy of this header and sets it only for that path.
  const headerStore = await headers()
  if (headerStore.get(SIGNUPS_REQUEST_HEADER) !== '1') await assertAdminArea()
  return children
}

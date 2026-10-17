import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { assertAdminArea } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await assertAdminArea()
  return children
}

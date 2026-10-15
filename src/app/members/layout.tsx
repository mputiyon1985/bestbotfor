import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { isClerkConfigured } from '@/lib/flags'

export default async function MembersLayout({ children }: { children: ReactNode }) {
  if (!isClerkConfigured()) redirect('/sign-in')
  const { auth } = await import('@clerk/nextjs/server')
  await auth.protect()
  return children
}

'use client'

import type { ReactNode } from 'react'
import { track } from '@/lib/analytics'

export function OutboundLink({
  slug,
  children,
  className,
}: {
  slug: string
  children: ReactNode
  className?: string
}) {
  return (
    <a
      href={`/go/${slug}`}
      rel="sponsored nofollow noopener"
      className={className}
      onClick={() => track('affiliate_click', { tool: slug })}
    >
      {children}
    </a>
  )
}
